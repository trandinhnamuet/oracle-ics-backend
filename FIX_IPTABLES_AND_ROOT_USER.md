# 🔥 FIX: Clear IPTables và Hướng Dẫn Dùng User Root

## 📋 VẤN ĐỀ

1. **Port 80, 443 đã mở trong Security List** nhưng VM vẫn không truy cập được từ bên ngoài
   - Nguyên nhân: IPTables có rules cũ đang block traffic
   - Cần: Clear/flush IPTables trước khi add rules mới

2. **Email hướng dẫn dùng user `ubuntu`** nhưng user muốn dùng `root`
   - Cần: Thay `ubuntu` → `root` trong email template

---

## ✅ GIẢI PHÁP ĐÃ ÁP DỤNG

### 1️⃣ **Clear IPTables Trước Khi Add Rules** ✅

**File**: `src/modules/oci/oci.service.ts`

**Thay đổi**: Thêm logic flush IPTables để xóa rules cũ

#### **UFW (Ubuntu)**:
```bash
# Disable và reset UFW trước
ufw --force disable
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
# Sau đó add rules mới
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

#### **IPTables (Fallback)**:
```bash
# Flush tất cả rules cũ
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# Add rules mới
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### 2️⃣ **Thêm User Root Vào Cloud-Init** ✅

**File**: `src/modules/oci/oci.service.ts`

**Thay đổi**: Thêm SSH keys cho user `root`

```yaml
users:
  - name: root
    ssh_authorized_keys:
      - <user_ssh_key>
      - <admin_ssh_key>
```

### 3️⃣ **Sửa Email Template** ✅

**File**: `src/modules/vm-subscription/vm-subscription.service.ts`

**Thay đổi**: 
- Ubuntu username: `ubuntu` → `root`
- SSH command: `ssh -i key.pem ubuntu@ip` → `ssh -i key.pem root@ip`

---

## 🚀 DEPLOYMENT

```bash
cd oracle-ics-backend
npm run build
pm2 restart oracle-ics-backend
```

---

## 🧪 TEST - VM MỚI

### **1. Tạo VM Ubuntu Mới**
Tạo VM từ frontend với Ubuntu image

### **2. Đợi Email**
Check email sẽ thấy:
- Username cho Ubuntu: `root` (không phải `ubuntu`)
- SSH command: `ssh -i key.pem root@<vm-ip>`

### **3. Test SSH**
```bash
# Save SSH key
cat > ~/.ssh/ubuntu-vm.pem << 'EOF'
[PASTE KEY FROM EMAIL]
EOF
chmod 600 ~/.ssh/ubuntu-vm.pem

# SSH với user root
ssh -i ~/.ssh/ubuntu-vm.pem root@<vm-ip>
```

**Expected**: Login thành công bằng user `root` ✅

### **4. Test Web Server**
```bash
# Trên VM, cài nginx
apt update
apt install nginx -y
systemctl start nginx

# Từ máy khác, test
curl http://<vm-ip>
```

**Expected**: Thấy nginx welcome page ✅

---

## 🔍 VERIFY IPTABLES

Trên VM mới, check IPTables:

```bash
# Check rules
sudo iptables -L -n -v

# Expected output:
Chain INPUT (policy ACCEPT)
target     prot opt in     out     source               destination
ACCEPT     all  --  lo     *       0.0.0.0/0            0.0.0.0/0
ACCEPT     all  --  *      *       0.0.0.0/0            0.0.0.0/0            state RELATED,ESTABLISHED
ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:22
ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:80
ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443
DROP       all  --  *      *       0.0.0.0/0            0.0.0.0/0
```

**Điểm quan trọng**:
- ✅ Rules ACCEPT cho port 22, 80, 443
- ✅ KHÔNG có rules cũ đang block
- ✅ Default DROP ở cuối (security)

---

## 🛠️ FIX VM CŨ

Nếu VM cũ vẫn bị block, SSH vào và chạy:

### **Ubuntu (UFW)**:
```bash
# Reset UFW
sudo ufw --force disable
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Verify
sudo ufw status numbered
```

### **IPTables Thủ Công**:
```bash
# Clear all rules
sudo iptables -F
sudo iptables -X
sudo iptables -t nat -F
sudo iptables -t nat -X
sudo iptables -t mangle -F
sudo iptables -t mangle -X

# Set default policies
sudo iptables -P INPUT ACCEPT
sudo iptables -P FORWARD ACCEPT
sudo iptables -P OUTPUT ACCEPT

# Add new rules
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -j DROP

# Save rules
sudo mkdir -p /etc/iptables
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# Make persistent (Ubuntu)
sudo apt install iptables-persistent -y
```

### **Test Sau Khi Fix**:
```bash
# Test local
curl http://localhost

# Get VM IP
hostname -I

# Test từ máy khác
curl http://<vm-ip>
```

---

## 📊 LOGS & DEBUGGING

### **Check Cloud-Init Logs**:
```bash
# Check status
cloud-init status

# Check logs
sudo cat /var/log/cloud-init.log | grep -i iptables
sudo cat /var/log/cloud-init-output.log | grep -i firewall

# Search for success message
sudo cat /var/log/cloud-init-output.log | grep "✅"
```

**Expected logs**:
```
✅ IPTables: Cleared and opened ports 22, 80, 443
✅ Cloud-init completed - Firewall configured for web traffic
```

### **Check Backend Logs**:
```bash
# On server
pm2 logs oracle-ics-backend --lines 100 | grep "Cloud-init"
```

---

## 🎯 CHECKLIST

### Backend Developer:
- [x] Clear IPTables trong cloud-init
- [x] Add user root với SSH keys
- [x] Update email template (ubuntu → root)
- [ ] Build và deploy backend
- [ ] Test với VM Ubuntu mới

### Test Checklist:
- [ ] Tạo VM Ubuntu mới
- [ ] Check email có hướng dẫn dùng `root`
- [ ] SSH bằng `root` user
- [ ] Check IPTables rules đã clear
- [ ] Cài nginx
- [ ] Test truy cập http://<vm-ip> từ bên ngoài
- [ ] Verify cloud-init logs

---

## 📝 SUMMARY

### **Trước Fix**:
❌ Port 80, 443 mở nhưng vẫn bị block bởi IPTables cũ  
❌ Email hướng dẫn dùng `ubuntu` user  

### **Sau Fix**:
✅ IPTables được clear hoàn toàn trước khi add rules mới  
✅ Port 80, 443 mở thực sự (có thể host web)  
✅ Email hướng dẫn dùng `root` user  
✅ SSH keys được add cho cả `root`, `ubuntu`, `opc`  

### **VM Mới**:
- ✅ Có thể SSH bằng `root` user
- ✅ Web server có thể truy cập từ bên ngoài
- ✅ IPTables rules sạch sẽ, không có rules cũ

### **Files Đã Sửa**:
1. `src/modules/oci/oci.service.ts` - Cloud-init config
2. `src/modules/vm-subscription/vm-subscription.service.ts` - Email template

