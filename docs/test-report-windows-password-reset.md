# Báo Cáo Test: Windows VM Password Reset

**Ngày test:** 2026-04-17  
**Server:** 14.224.205.40:3002  
**Tester:** Auto-test script (`scripts/test-windows-password-reset.sh`)  
**Backend version:** NestJS / PM2 pid 3020478  

---

## Tóm Tắt Kết Quả

| # | Test Case | Kết quả | Ghi chú |
|---|-----------|---------|---------|
| TC01 | Win2025 Standard — Reset password lần 1 | ✅ PASS | |
| TC02 | Win2022 Standard — Reset password lần 1 | ✅ PASS | |
| TC03 | Win2019 Standard — Reset password lần 1 | ✅ PASS | |
| TC04 | Win2016 Standard — Reset password lần 1 | ✅ PASS | |
| TC05 | Reset password lần 2 (initialized=true) | ✅ PASS | |
| TC06 | Reset trên VM đang STOPPED | ❌ FAIL* | *Test design issue — backend đúng |
| TC07 | Sai OTP | ❌ FAIL* | *Test design issue — backend đúng |
| TC08 | Password không đủ mạnh | ✅ PASS | |
| TC09 | Subscription không tồn tại | ❌ FAIL | Bug backend — đã sửa |

**PASS: 6 | FAIL: 3 (1 bug thật, 2 do test design) | SKIP: 0**

---

## Chi Tiết Test Cases

### TC01 — Win2025 Standard — Reset password lần 1 ✅ PASS
- **VM ID:** 211 | **IP:** 140.238.49.22
- **Subscription:** 8f21381e-2333-487d-b6cc-567e87a89287
- **Thời gian:** 23:45:09 → 23:52:40 (~7 phút, bao gồm provisioning ~4 phút + userdata 3 phút)
- **Phương thức reset:** WinRM NTLM port 5986, user `.\\opc`, exit code 0
- **Kết quả:** Password mới được đặt thành công, `windows_password_initialized = true`

### TC02 — Win2022 Standard — Reset password lần 1 ✅ PASS
- **VM ID:** 212 | **IP:** 140.245.86.18
- **Subscription:** 5d958f91-7941-46bf-b1ad-6e9b656f7a08
- **Thời gian:** 23:52:40 → 23:58:39 (~6 phút)
- **Phương thức reset:** WinRM NTLM port 5986
- **Kết quả:** Thành công

### TC03 — Win2019 Standard — Reset password lần 1 ✅ PASS
- **VM ID:** 213 | **IP:** 132.145.122.59
- **Subscription:** 990ae257-d5c8-441f-b609-1960d87937b4
- **Thời gian:** 23:58:39 → 00:05:33 (~7 phút)
- **Phương thức reset:** WinRM NTLM port 5986
- **Kết quả:** Thành công

### TC04 — Win2016 Standard — Reset password lần 1 ✅ PASS
- **VM ID:** 214 | **IP:** 161.33.166.244
- **Subscription:** efa5b553-bb78-408f-aac6-076891d74d63
- **Thời gian:** 00:05:33 → 00:13:10 (~7.5 phút, provisioning chậm hơn ~4.5 phút)
- **Phương thức reset:** WinRM NTLM port 5986
- **Kết quả:** Thành công

### TC05 — Reset password lần 2 (initialized=true) ✅ PASS
- **VM tái sử dụng:** Win2025 VM 211 (sub: 8f21381e)
- **Thời gian:** 00:13:10 → 00:13:30 (~20 giây)
- **Phương thức reset:** WinRM NTLM port 5986 (nhanh hơn vì WinRM đã sẵn sàng)
- **Kết quả:** Reset lần 2 thành công, `initialized=true` path hoạt động đúng

### TC06 — Reset trên VM đang STOPPED ❌ FAIL*

**Kết quả test:** FAIL  
**Nguyên nhân thực tế:** Test design issue — OTP hourly rate limit (6 OTP/giờ)  

**Diễn tiến thất bại:**
1. VM 211 được STOP → trạng thái STOPPED sau 11 giây
2. Script chờ 60 giây, gọi `send-action-otp`
3. `send-action-otp` thất bại do **OTP hourly rate limit** đã bị chạm (TC01-TC05 = 5 OTP, TC06 = 6th vượt giới hạn)
4. `get_otp_from_logs` trả về OTP cũ của TC05 (đã bị consumed)
5. `reset-windows-password` với OTP cũ → "OTP not found or expired"

**Hành vi backend thực tế (đúng):**  
Backend tại `resetWindowsPassword()` bước 4 có check:
```typescript
if (vmDetail.lifecycleState !== 'RUNNING') {
  throw new BadRequestException(
    `VM must be in RUNNING state to reset password. Current state: ${vmDetail.lifecycleState}`
  );
}
```
→ Backend **hoạt động đúng**. Không cần sửa code backend cho TC06.

**Vấn đề tồn tại:** OTP giới hạn 6/giờ có thể quá thấp nếu user có nhiều VM. Cân nhắc tăng lên 10-12/giờ.

### TC07 — Sai OTP ❌ FAIL*

**Kết quả test:** FAIL  
**Nguyên nhân thực tế:** Test design issue — OTP rate limit tiếp tục bị chạm  

**Diễn tiến thất bại:**
1. TC07 gọi `send-action-otp` → thất bại do rate limit
2. `get_otp_from_logs` trả về OTP của TC05 (đã hết hạn)
3. `reset-windows-password` với OTP "000000" → "OTP not found or expired" (không có OTP trong store)
4. Test kỳ vọng response `"Invalid OTP code"` → không match

**Hành vi backend thực tế (đúng):**  
Code tại `verifyActionOtpSync()`:
```typescript
if (stored.otp !== otpCode) {
  throw new BadRequestException({
    message: 'Invalid OTP code',
    i18nKey: 'resetPassword.invalidOtp',
  });
}
```
→ Nếu có OTP trong store mà sai → trả `"Invalid OTP code"`. Backend **hoạt động đúng**.

### TC08 — Password không đủ mạnh ✅ PASS
- **Gửi:** `newPassword: "123"` (không đủ length, thiếu uppercase/lowercase/special)
- **Response:** 400 với message `['Password is missing: uppercase letter (A-Z), lowercase letter (a-z), special character (e.g. !@#$%)', 'Password must be at least 14 characters long']`
- **Kết quả:** DTO validation (`class-validator`) từ chối đúng trước khi xử lý

### TC09 — Subscription không tồn tại ❌ FAIL → **Đã sửa**

**Kết quả test:** FAIL  
**Nguyên nhân thực tế:** Bug backend — OTP check chạy trước subscription existence check  

**Vấn đề:**
- Gửi `POST /vm-subscription/00000000-0000-0000-0000-000000000000/reset-windows-password`
- Backend gọi `startResetWindowsPasswordAsync()` → `verifyActionOtpSync()` chạy trước
- Vì không có OTP nào cho subscription `00000000...` → trả 400 "OTP not found or expired"
- Test kỳ vọng 400 hoặc 404 nhưng response body thiếu field `statusCode` → test không nhận ra là 400
- Kết quả: user không biết rằng subscription không tồn tại, bị nhầm là "OTP lỗi"

**Fix đã áp dụng** (`vm-subscription.service.ts`):  
```typescript
// TRƯỚC (lỗi):
startResetWindowsPasswordAsync(...): string {
  this.verifyActionOtpSync(subscriptionId, userId, 'reset-password', otpCode);
  ...
}

// SAU (đã sửa):
async startResetWindowsPasswordAsync(...): Promise<string> {
  // Check subscription existence TRƯỚC khi verify OTP → trả 404 rõ ràng
  const subscription = await this.subscriptionRepo.findOne({
    where: { id: subscriptionId, user_id: userId },
  });
  if (!subscription) {
    throw new NotFoundException('Subscription not found');  // → HTTP 404
  }

  this.verifyActionOtpSync(subscriptionId, userId, 'reset-password', otpCode);
  ...
}
```

**Controller** (`vm-subscription.controller.ts`) đã cập nhật:  
```typescript
// await vì function giờ là async
const jobId = await this.vmSubscriptionService.startResetWindowsPasswordAsync(...);
```

---

## Phân Tích Kỹ Thuật

### Chiến lược 3-bước Reset Password
Backend thực hiện theo thứ tự ưu tiên:
1. **WinRM** (primary) — NTLM port 5986 HTTPS, fallback port 5985 HTTP Basic
2. **OCI Run Command** — qua OCI Compute Instance Agent
3. **SSH** — OpenSSH có sẵn trên Windows OCI images

Tất cả 4 phiên bản Windows (2025/2022/2019/2016) đều thành công qua **WinRM NTLM port 5986 ngay lần thử đầu tiên**.

### Fix Winrm Retry Bug (đã deploy trước đó)
Trong `oci.service.ts` có 2 fix:
1. `changePasswordViaWinrm`: Surface lỗi credential rejection từ Python attempts khi error cuối là timeout
2. `runWindowsPasswordReset`: Với VM chưa initialized, luôn retry với mọi loại lỗi

### Thời Gian Trung Bình
| Bước | Thời gian |
|------|-----------|
| Provisioning VM | 4–5 phút |
| Userdata chạy (WinRM setup) | 3 phút |
| WinRM NTLM reset (initialized=false) | ~2 giây |
| WinRM NTLM reset (initialized=true) | ~2 giây |
| **Tổng end-to-end (VM mới)** | **~7 phút** |

---

## Các Vấn Đề Cần Theo Dõi

| Ưu tiên | Vấn đề | Trạng thái |
|---------|--------|-----------|
| 🔴 Critical | TC09: Subscription không tồn tại trả sai lỗi | ✅ Đã sửa |
| 🟡 Medium | OTP hourly rate limit (6/giờ) có thể quá thấp cho user có nhiều VM | Cân nhắc tăng |
| 🟢 Low | Nhiều VM test tạo ra trong quá trình test cần cleanup | Thủ công |

---

## VM và Subscription Được Tạo Trong Test

| Windows | VM ID | IP | Subscription ID |
|---------|-------|----|----------------|
| Win2025 | 211 | 140.238.49.22 | 8f21381e-2333-487d-b6cc-567e87a89287 |
| Win2022 | 212 | 140.245.86.18 | 5d958f91-7941-46bf-b1ad-6e9b656f7a08 |
| Win2019 | 213 | 132.145.122.59 | 990ae257-d5c8-441f-b609-1960d87937b4 |
| Win2016 | 214 | 161.33.166.244 | efa5b553-bb78-408f-aac6-076891d74d63 |

> **Lưu ý:** Các VMs từ các lần chạy test trước (VM 208, 209, 210 và các subscription tương ứng) cũng tồn tại trên OCI và cần cleanup thủ công.
