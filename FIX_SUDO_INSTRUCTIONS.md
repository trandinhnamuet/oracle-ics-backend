# Hướng Dẫn Fix Sudo Cho VM Đã Tạo

## Vấn Đề
User `opc` SSH vào được nhưng không dùng được sudo vì không biết password.

## Giải Pháp 1: Sử dụng OCI Console (Không cần SSH)

### Bước 1: Mở OCI Console
1. Đăng nhập vào https://cloud.oracle.com
2. Vào **Compute** → **Instances**
3. Click vào VM bị lỗi

### Bước 2: Sử dụng Console Connection
1. Scroll xuống phần **Resources** → Click **Console Connections**
2. Click **Create Console Connection**
3. Paste SSH public key của bạn
4. Sau khi tạo xong, click **Copy Serial Console Connection for Linux/Mac**
5. Chạy lệnh SSH trong terminal (sẽ kết nối qua serial console)

### Bước 3: Fix Sudo (Từ Serial Console)
```bash
# Login bằng opc user (sẽ hỏi password - nhấn Enter hoặc thử password rỗng)
# Nếu không login được, reboot VM và nhấn 'e' ở GRUB menu để boot vào single-user mode

# Sau khi login được, chạy:
sudo visudo
# Hoặc nếu visudo không work:
echo "opc ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/90-cloud-init-users

# Set permissions
sudo chmod 0440 /etc/sudoers.d/90-cloud-init-users

# Test
sudo whoami  # Phải trả về 'root' mà không hỏi password
```

---

## Giải Pháp 2: Sử dụng Cloud-Init (Khi Tạo VM Mới)

### Không áp dụng được cho VM đã tạo - chỉ cho VM mới

Cần update code backend để thêm cloud-init config.

---

## Giải Pháp 3: Recreate VM Instance

Nếu Console Connection không work, phải xóa VM và tạo lại với cloud-init config đúng.

### Các bước:
1. Terminate VM instance trên OCI Console
2. Update backend code (xem FIX_BACKEND.md)
3. Tạo VM mới từ frontend
4. VM mới sẽ có sudo working ngay

---

## Giải Pháp 4: Instance Metadata Service (Advanced)

Nếu VM đang chạy và có internet:

```bash
# SSH vào VM với user key
ssh -i your-key.pem opc@vm-ip

# Chạy các lệnh SAU đây KHÔNG CẦN SUDO (vì chúng không yêu cầu quyền root):

# 1. Xem cloud-init status
cloud-init status

# 2. Xem cloud-init logs
cat /var/log/cloud-init.log
cat /var/log/cloud-init-output.log

# 3. Kiểm tra sudoers file
cat /etc/sudoers.d/90-cloud-init-users

# Nếu file trên KHÔNG TỒN TẠI hoặc không có dòng "opc ALL=(ALL) NOPASSWD: ALL"
# thì đó là nguyên nhân

# 4. Thử tạo file sudoers mới (method hack - không khuyên dùng)
# Tạo script và chạy qua OCI Instance Console hoặc user-data update
```

---

## Giải Pháp Tốt Nhất: UPDATE CODE BACKEND

Xem file `SOLUTION_CLOUD_INIT.md` để update code backend và prevent vấn đề này cho các VM mới.

## Giải Pháp Tạm Thời: Set Password cho opc

**CẢNH BÁO**: Không khuyên dùng vì kém bảo mật, nhưng nếu cần gấp:

### Cách 1: Từ OCI Console (Serial Console)
```bash
# Sau khi access được serial console
sudo passwd opc
# Nhập password mới
```

### Cách 2: Sử dụng Instance Metadata
```bash
# Tạo user-data script để reset password
# (Phải có quyền edit instance configuration)
```

---

## Prevention: Không để xảy ra lại

1. **Update backend code** với cloud-init config (xem SOLUTION_CLOUD_INIT.md)
2. **Test VM mới** sau khi update code
3. **Document** quy trình tạo VM chuẩn
4. **Backup** SSH keys và credentials

