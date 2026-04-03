# Windows VM Password Reset — Tóm tắt, nguyên nhân và hướng dẫn bảo toàn tính năng

Mục tiêu: tổng hợp chi tiết các vấn đề đã gặp, nguyên nhân gốc, các thay đổi đã triển khai và quy tắc bắt buộc để giữ tính năng "bắt buộc đổi mật khẩu lần đầu (initial password)" hoạt động đúng, đồng thời đảm bảo API reset mật khẩu vẫn vận hành.

---

## 1) Tổng quan nhanh
- Trạng thái hiện tại: Quy trình reset password cho Windows VMs đã ổn định.
  - Các sửa chính: chuyển sang job bất đồng bộ (HTTP 202 + polling), loại bỏ `spawnSync` blocking, phục hồi logic `/logonpasswordchg:no` hành vi cũ bằng cách thay đổi kiến trúc để vẫn bắt buộc đổi mật khẩu lần đầu và cho phép API reset hoạt động.
  - SSH-based reset hiện hoạt động ổn định (embedding SSH keys, tạo host keys, cấu hình `sshd`, ACL đúng), WinRM chỉ dùng khi VM đã `windows_password_initialized=true`.

---

## 2) Lịch sử các vấn đề chính (tóm tắt theo giai đoạn)
1. 504 Gateway Timeout: request đồng bộ chạy quá lâu (OCI Run Command + soft reset), nginx/Reverse Proxy kill connection.
   - Fix: Tách thành job bất đồng bộ — `POST` trả về `202` với `jobId`, client poll status.

2. Server blocking bug: `spawnSync('python3', ...)` trong đường dẫn WinRM làm Node.js block toàn bộ event loop (~90s).
   - Fix: Thay bằng `spawn` bất đồng bộ, Promise, kill timer.

3. Sau thay đổi, WinRM thất bại trên VM mới (credentials rejected). Nguyên nhân: commit đã vô tình loại bỏ `net user opc /logonpasswordchg:no` trong deferred boot script.
   - Phân tích: `cloudbase-init` chạy `UserDataPlugin` → `SetUserPasswordPlugin` → `SshPublicKeysPlugin`. `SetUserPasswordPlugin` đặt flag "must change password at next logon" theo mặc định.
   - Khi flag này bật, Windows (WinRM/NTLM) sẽ từ chối authentication cho tài khoản đến khi người dùng đổi mật khẩu qua RDP.

4. Thiết kế mới: muốn **bắt buộc người dùng đổi initial password khi RDP lần đầu** (tăng an ninh), nhưng vẫn giữ khả năng reset qua API.
   - Giải pháp: thêm cột DB `windows_password_initialized` (boolean).
     - Khi `false`: WinRM bị skip, dùng OCI Run Command (nếu agent khỏe) hoặc SSH admin key để reset.
     - Sau reset thành công bởi API, set `windows_password_initialized = true`.
   - Deferred boot script: không xoá `must-change` (không dùng `/logonpasswordchg:no` tự động nữa), để buộc user đổi mật khẩu lần đầu.

5. SSH handshake timeout / authentication fail (nguyên nhân chính tiếp theo):
   - Root cause: trong `UserDataPlugin` script ban đầu có logic `if (Test-Path C:\Users\opc\.ssh\authorized_keys) { Copy-Item ... }`. Nhưng `SshPublicKeysPlugin` (ghi file `C:\Users\opc\.ssh\authorized_keys`) chạy SAU `UserDataPlugin` → file chưa tồn tại → `administrators_authorized_keys` không được tạo → `sshd` chấp nhận TCP nhưng không có key để auth hoặc có ACL/host-key problem → SSH auth/trong ssh2 hiện ra `Timed out while waiting for handshake`.
   - Fix: embed trực tiếp `sshPublicKeys` (base64) vào `windowsSetupScript` trong `launchInstance()` để luôn tạo `C:\ProgramData\ssh\administrators_authorized_keys` ngay tại UserDataPlugin (không lệ thuộc plugin order). Đồng thời:
     - Tạo SSH host keys nếu thiếu (`ssh-keygen -A`).
     - Cập nhật `sshd_config` để đảm bảo `PubkeyAuthentication yes` và `Match Group administrators` trỏ tới `__PROGRAMDATA__/ssh/administrators_authorized_keys`.
     - Đặt ACL chính xác: remove inheritance rồi grant chỉ `SYSTEM` và `Administrators`.
     - Restart sshd và verify service
     - Thêm backup deferred copy (sau 5 phút) để cover edge-cases.

6. OCI Run Command plugin instability: trên một số Windows images, Oracle Cloud Agent nhận được command (VISIBLE/ACCEPTED) nhưng không tiến tới IN_PROGRESS do bug nội bộ agent/image. Kết luận: không thể sửa từ phía server — coi RC là fallback chỉ khi plugin hoạt động.

7. Other improvements:
   - Loại bỏ SOFTRESET (không hữu ích, gây delay lớn)
   - Giảm timeout OCI RC từ 8 phút → 2 phút (không chờ lâu vô ích)
   - Thêm retry logic cho SSH reset (3 attempts, 30s gap) + readyTimeout điều chỉnh

---

## 3) Tại sao trước đây dùng `/logonpasswordchg:no` (giải thích chi tiết)
- `cloudbase-init` **SetUserPasswordPlugin** (thực thi động) đặt mật khẩu Windows và mặc định đánh dấu "User must change password at next logon".
- Với flag này bật, Windows/NTLM/WinRM **từ chối** mọi authentication cho account đó cho tới khi người dùng đổi mật khẩu khi đăng nhập bằng GUI (RDP). Do đó, WinRM reset (dùng chính credentials Windows) sẽ bị `credentials rejected` nếu flag vẫn bật.
- Trước đây, workaround là chạy `net user opc /logonpasswordchg:no` trong một deferred script (sau Sleep 300) — điều này xóa flag và cho phép WinRM NTLM chấp nhận credentials, vì thế WinRM reset chạy thành công mà không cần user đổi mật khẩu qua RDP.
- Tuy nhiên, đó là cách làm "bỏ qua" tính năng bảo mật ép người dùng đổi mật khẩu lần đầu. Thiết kế hiện tại quyết định: tiếp tục ép đổi mật khẩu (GIỮ flag), nhưng cho API reset hoạt động bằng cách:
  - Sử dụng SSH admin key và OCI RC như phương thức khôi phục (SSH là phương thức chính do ta có control),
  - Thêm cột `windows_password_initialized` để biết khi nào WinRM an toàn để sử dụng.

---

## 4) Thiết kế & invariant hiện tại — những gì phải **không thay đổi** (quy tắc bắt buộc)
- Không xóa cột `windows_password_initialized` mà không hiểu toàn bộ luồng.
- Không tự động xoá flag "must change password" trong boot script nữa. Nếu muốn thay đổi, phải:
  - Cập nhật `windows_password_initialized` logic tương ứng trong DB,
  - Đảm bảo điều kiện bảo mật/ghi chú rõ ràng.
- Khi chỉnh sửa `windowsSetupScript` trong `launchInstance()` (file: [oracle-ics-backend/src/modules/oci/oci.service.ts](oracle-ics-backend/src/modules/oci/oci.service.ts)), luôn đảm bảo:
  - `sshPublicKeys` được embed hoặc deferred script copy vẫn tồn tại,
  - Host keys được sinh nếu thiếu (`ssh-keygen -A`),
  - `administrators_authorized_keys` được tạo và có ACL chính xác,
  - `sshd_config` có `PubkeyAuthentication yes` và `Match Group administrators` block.
- Không dùng `spawnSync` hoặc blocking syscalls trong dịch vụ (sử dụng async spawn/process với timeout và kill).
- API reset phải là mô hình background job (POST => 202 + jobId) — không đổi.

---

## 5) Các thay đổi quan trọng đã triển khai (code pointers)
- `windows_password_initialized` migration: [oracle-ics-backend/src/migrations/20260402120000-AddWindowsPasswordInitializedToVmInstances.ts](oracle-ics-backend/src/migrations/20260402120000-AddWindowsPasswordInitializedToVmInstances.ts)
- `oci.service.ts` (Windows setup script + SSH embedding + host key generation + ACL + restart sshd + SSH retry logic): [oracle-ics-backend/src/modules/oci/oci.service.ts](oracle-ics-backend/src/modules/oci/oci.service.ts)
- Orchestration + async job: [oracle-ics-backend/src/modules/vm-subscription/vm-subscription.service.ts](oracle-ics-backend/src/modules/vm-subscription/vm-subscription.service.ts)
- Controller endpoints: [oracle-ics-backend/src/modules/vm-subscription/vm-subscription.controller.ts](oracle-ics-backend/src/modules/vm-subscription/vm-subscription.controller.ts)
- Test helper: [oracle-ics-backend/test_reset.py](oracle-ics-backend/test_reset.py)

---

## 6) Hướng dẫn khắc phục tạm thời cho VM đã tồn tại (nếu cần test thủ công)
Nếu gặp VM cũ có SSH handshake timeout (sshd không load authorized_keys): connect qua RDP hoặc OCI serial/console (nếu có) rồi chạy PowerShell dưới quyền Administrator:

```powershell
# Ghi admin public key trực tiếp
$adminPubKey = '<PUT_ADMIN_PUBLIC_KEY_HERE>'
$admFile = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (-not (Test-Path (Split-Path $admFile))) { New-Item -ItemType Directory -Path (Split-Path $admFile) -Force }
$adminPubKey | Set-Content -Path $admFile -Encoding UTF8
# Fix ACLs
icacls $admFile /inheritance:r
icacls $admFile /grant:r "NT AUTHORITY\SYSTEM:(F)"
icacls $admFile /grant:r "BUILTIN\Administrators:(F)"
# Ensure host keys exist
if (-not (Test-Path "$env:ProgramData\ssh\ssh_host_rsa_key")) { & "$env:SystemRoot\System32\OpenSSH\ssh-keygen.exe" -A }
# Restart sshd
Restart-Service sshd -Force -ErrorAction SilentlyContinue
```

Sau đó thử SSH từ backend (hoặc local) với admin key.

> Lưu ý: nếu không có quyền RDP/console, phương án an toàn nhất là recreate VM mới có script updated.

---

## 7) Quy trình kiểm thử (Checklist)
1. Tạo VM mới (dùng `launchInstance` hiện tại) — xác nhận `metadata.user_data` chứa embedded SSH keys.
2. Đợi VM `RUNNING` và đợi cloudbase-init (~5 phút).
3. Kiểm tra DB `oracle.vm_instances.windows_initial_password` có giá trị (nếu VM mới tạo chưa có initial password chưa, chờ provisioning tasks của provisioning service).
4. Gọi API reset (POST .../reset-windows-password) → nhận `202 { jobId }`.
5. Giám sát logs PM2 (`pm2 logs oracle-ics-backend`) — kiểm tra luồng:
   - WinRM được skip nếu `windows_password_initialized=false`.
   - OCI RC chỉ chạy nếu plugin RUNNING, else log NOT FOUND.
   - SSH thử connect (3 attempts, readyTimeout 90s mỗi attempt) và log kết quả.
6. Sau thành công, kiểm tra DB `windows_password_initialized = true` và `windows_initial_password` cập nhật.

Các lệnh hữu ích:
```bash
# View backend logs (server)
pm run logs:backend  # or: pm2 logs oracle-ics-backend --lines 200

# Query DB quickly via helper in repo
python test_reset.py dbq "SELECT id, public_ip, windows_password_initialized FROM oracle.vm_instances WHERE id = 46"

# Trigger reset (via helper script)
python test_reset.py reset <subscription_id> "NewPass@123"
```

---

## 8) Kiểm tra khi cập nhật code (quy tắc làm việc)
- Nếu thay đổi `windowsSetupScript`:
  - Đảm bảo `embeddedSshKeysB64` vẫn được tính từ `sshPublicKeys` đầu vào hoặc có fallback deferred copy.
  - Không xóa đoạn tạo host keys.
  - Không sửa ACL logic (phải `inheritance:r` rồi `grant:r` cho SYSTEM và Administrators).
- Nếu thay đổi logic reset (thêm strategy mới):
  - Luôn giữ job pattern (202 + jobId), không chạy blocking trong request handler.
  - Thêm unit/integration test mô phỏng VM (nếu có thể), và test trên một VM staging.
- Nếu cần revert `/logonpasswordchg:no` tự động: phải thảo luận rõ ràng vì sẽ vô hiệu hoá việc ép người dùng đổi mật khẩu lần đầu.

---

## 9) Next steps / Recommendations
- Lưu file này vào repo `docs/` (đã thực hiện) để mọi PR liên quan tới Windows init script hoặc reset logic phải tham chiếu.
- Thêm một CI check (PR template) bắt buộc review các thay đổi liên quan đến `src/modules/oci/oci.service.ts` và migration `AddWindowsPasswordInitializedToVmInstances`.
- Nếu muốn, tôi có thể commit + push file này lên repo ngay.

---

*File này được tạo để làm single source-of-truth cho mọi sửa đổi liên quan Windows password reset. Khi cập nhật code, đọc file này trước khi thay đổi để tránh phá vỡ invariant "bắt buộc đổi initial password".*
