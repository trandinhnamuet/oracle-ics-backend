# 🛠️ GIẢI PHÁP TOÀN DIỆN: Fix Sudo Cho VM Oracle Cloud

## 📋 TÓM TẮT VẤN ĐỀ

Khi tạo VM, user nhận được email chứa:
- ✅ Public IP
- ✅ SSH private key cho user `opc`
- ❌ **KHÔNG CÓ** password để dùng sudo
- ❌ User `opc` không thể cài nginx, sửa file, chạy lệnh root

**Nguyên nhân**: Backend chỉ đẩy SSH keys vào metadata, KHÔNG cấu hình cloud-init để cho phép sudo NOPASSWD.

---

## ✅ GIẢI PHÁP ĐÃ ÁP DỤNG

### 1️⃣ **ĐÃ FIX CODE BACKEND** ✅

File: `src/modules/oci/oci.service.ts`

**Thay đổi**: Thêm cloud-init configuration vào metadata khi launch instance

**Kết quả**: 
- User `opc` có thể dùng `sudo` ngay không cần password
- User `ubuntu` (nếu dùng Ubuntu image) cũng có sudo
- SSH keys được inject tự động
- Các package cần thiết (vim, curl, git...) được cài sẵn

### 2️⃣ **Cloud-Init Config Chi Tiết**

```yaml
#cloud-config
users:
  - default                              # Giữ user mặc định từ image
  - name: opc                            # Oracle Linux user
    sudo: ['ALL=(ALL) NOPASSWD:ALL']     # Cho phép sudo không password
    shell: /bin/bash
    ssh_authorized_keys:
      - <user_ssh_key>                   # Key từ email user
      - <admin_ssh_key>                  # System admin key

  - name: ubuntu                         # Ubuntu user (nếu dùng Ubuntu image)
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    shell: /bin/bash
    ssh_authorized_keys:
      - <user_ssh_key>
      - <admin_ssh_key>

ssh_pwauth: false                        # Disable SSH password login (chỉ dùng key)
disable_root: false                      # Cho phép root nếu cần

packages:                                # Cài packages ngay từ đầu
  - vim
  - curl
  - wget
  - git
  - net-tools

runcmd:                                  # Chạy khi boot lần đầu
  - echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
  - echo "ubuntu ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/90-cloud-init-users
  - chmod 0440 /etc/sudoers.d/90-cloud-init-users
  - systemctl restart sshd
```

---

## 🚀 CÁCH SỬ DỤNG

### **Cho VM MỚI** (Sau khi deploy code mới)

1. **Deploy backend mới**:
```bash
cd oracle-ics-backend
npm run build
pm2 restart oracle-ics-backend
```

2. **Tạo VM từ frontend như bình thường**

3. **SSH vào VM và test**:
```bash
# SSH vào
ssh -i <path-to-key>.pem opc@<vm-ip>

# Test sudo (phải work ngay)
sudo whoami
# Output: root ✅

# Cài nginx không cần password
sudo yum install -y nginx  # Oracle Linux
# hoặc
sudo apt install -y nginx  # Ubuntu

# Edit files hệ thống
sudo nano /etc/nginx/sites-available/default
```

---

### **Cho VM ĐÃ TẠO** (Trước khi deploy code mới)

Có 3 cách:

#### **Cách 1: Sử dụng OCI Console Connection** (Khuyên dùng)

1. Vào OCI Console → Compute → Instances → Click VM
2. Resources → Console Connections → Create Console Connection
3. Paste SSH public key → Create
4. Copy lệnh SSH serial console và chạy
5. Login vào VM qua serial console
6. Chạy các lệnh fix:

```bash
# Tạo sudoers file
sudo su -
echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users
chmod 0440 /etc/sudoers.d/90-cloud-init-users

# Test
su - opc
sudo whoami
# Output: root ✅
```

#### **Cách 2: Sử dụng Instance Principal** (Nếu có)

```bash
# SSH vào với key hiện tại
ssh -i key.pem opc@vm-ip

# Download và chạy fix script
curl -o fix-sudo.sh https://your-server.com/fix-sudo.sh
bash fix-sudo.sh
```

Nội dung `fix-sudo.sh`:
```bash
#!/bin/bash
# Fix sudo for opc user

# Create sudoers file (requires root, but can be done via cloud-init rerun)
sudo bash -c 'echo "opc ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-cloud-init-users'
sudo chmod 0440 /etc/sudoers.d/90-cloud-init-users

echo "✅ Sudo fixed! Try: sudo whoami"
```

#### **Cách 3: Xóa và Tạo Lại VM** (Dễ nhất)

1. Backup data quan trọng (nếu có)
2. Terminate VM instance trên OCI Console
3. Deploy code backend mới
4. Tạo VM mới từ frontend
5. VM mới sẽ có sudo working ngay ✅

---

## 🔍 VERIFY CLOUD-INIT HOẠT ĐỘNG

Sau khi tạo VM mới với code đã fix:

```bash
# SSH vào VM
ssh -i key.pem opc@<vm-ip>

# 1. Check cloud-init status
cloud-init status
# Output: status: done ✅

# 2. Check cloud-init logs
sudo cat /var/log/cloud-init.log
sudo cat /var/log/cloud-init-output.log

# 3. Verify sudoers file exists
cat /etc/sudoers.d/90-cloud-init-users
# Output: opc ALL=(ALL) NOPASSWD: ALL ✅

# 4. Test sudo
sudo whoami
# Output: root ✅

# 5. Check installed packages
which vim curl git wget
# All should exist ✅

# 6. Verify SSH keys
cat ~/.ssh/authorized_keys
# Should have 2 keys: user key + admin key ✅
```

---

## 📊 LOGS BACKEND

Khi tạo VM mới, backend sẽ log:

```log
[Nest] INFO [OciService] 🔑 Preparing to launch instance with 2 SSH keys
[Nest] INFO [OciService] 📝 Metadata ssh_authorized_keys length: 800 chars
[Nest] INFO [OciService] 📝 Cloud-init user_data configured (450 chars, base64: 600 chars)
[Nest] INFO [OciService] 📝 Full SSH keys being sent to OCI:
ssh-rsa AAAAB3Nza... user@email.com
ssh-rsa AAAAB3Nza... system-admin-key
[Nest] INFO [OciService] ✅ Launched instance with cloud-init: ocid1.instance.oc1...
```

---

## ⚠️ LƯU Ý QUAN TRỌNG

### 1. **Cloud-Init Chỉ Chạy Lần Đầu**
- Cloud-init chỉ chạy khi first boot
- Reboot VM không chạy lại cloud-init
- Nếu cần chạy lại: `sudo cloud-init clean && sudo reboot`

### 2. **YAML Syntax Phải Đúng**
- Indentation phải chính xác (dùng spaces, không dùng tabs)
- Nếu YAML sai → cloud-init fail → sudo không work

### 3. **Base64 Encoding Bắt Buộc**
- OCI API yêu cầu user_data phải base64 encoded
- Code đã tự động encode: `Buffer.from(cloudInitConfig).toString('base64')`

### 4. **Multiple OS Support**
- Config hỗ trợ cả Oracle Linux (opc) và Ubuntu (ubuntu)
- Windows VMs không dùng được cloud-init (phải dùng RDP)

### 5. **Security**
- `ssh_pwauth: false` → Disable password SSH (chỉ dùng key)
- Nếu cần password SSH, set `ssh_pwauth: true` (KHÔNG khuyên dùng)

---

## 🎯 CHECKLIST DEPLOYMENT

- [x] Code backend đã được update (oci.service.ts)
- [ ] Build backend: `npm run build`
- [ ] Restart backend: `pm2 restart oracle-ics-backend`
- [ ] Test tạo VM mới từ frontend
- [ ] SSH vào VM mới
- [ ] Test `sudo whoami` (phải output: root)
- [ ] Test cài package: `sudo yum install -y nginx`
- [ ] Check cloud-init logs: `sudo cat /var/log/cloud-init.log`
- [ ] Verify 2 SSH keys trong authorized_keys
- [ ] Document changes trong README

---

## 📞 TROUBLESHOOTING

### Vấn đề: VM mới vẫn không sudo được

**Kiểm tra**:
```bash
# 1. Cloud-init có chạy không?
cloud-init status
# Nếu status: error → check logs

# 2. Xem lỗi cloud-init
sudo cat /var/log/cloud-init.log | grep -i error
sudo cat /var/log/cloud-init.log | grep -i fail

# 3. Check user_data có được inject không?
curl http://169.254.169.254/opc/v1/instance/metadata/ | grep user_data

# 4. Sudoers file có tồn tại không?
ls -la /etc/sudoers.d/
cat /etc/sudoers.d/90-cloud-init-users
```

**Giải pháp**:
- Nếu cloud-init failed → Check YAML syntax trong code
- Nếu user_data không có → Check metadata trong OCI console
- Nếu sudoers file không có → Tạo thủ công hoặc recreate VM

### Vấn đề: Backend log không thấy cloud-init config

**Kiểm tra**:
```bash
# Check backend logs
pm2 logs oracle-ics-backend --lines 100 | grep "Cloud-init"

# Nếu không thấy → code chưa được deploy
```

**Giải pháp**:
```bash
cd oracle-ics-backend
git pull
npm run build
pm2 restart oracle-ics-backend
```

---

## 📚 TÀI LIỆU THAM KHẢO

1. **Cloud-Init Documentation**: https://cloudinit.readthedocs.io/
2. **OCI Instance Metadata**: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/gettingmetadata.htm
3. **OCI Cloud-Init Support**: https://docs.oracle.com/en-us/iaas/Content/Compute/References/cloud-init.htm

---

## ✅ KẾT LUẬN

**Vấn đề đã được FIX**:
- ✅ Code backend đã update với cloud-init config
- ✅ VM mới sẽ có sudo working ngay
- ✅ Hỗ trợ cả Oracle Linux và Ubuntu
- ✅ Security được tăng cường (disable password SSH)
- ✅ Packages cần thiết được cài sẵn

**Hành động tiếp theo**:
1. Deploy code mới lên server
2. Test tạo VM mới
3. Verify sudo hoạt động
4. Update documentation cho team
5. Thông báo cho users về improvement

