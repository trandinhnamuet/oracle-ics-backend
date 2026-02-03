# 🔥 FIX: Mở Port 80, 443 Cho VM Làm Web Server

## 📋 VẤN ĐỀ

VM được tạo để làm web server nhưng không thể truy cập từ bên ngoài qua port 80, 443:

```bash
curl: (7) Failed to connect to chatbot.icss.com.vn port 80: No route to host
curl: (7) Failed to connect to 168.110.60.47 port 80: No route to host
```

**Nguyên nhân**: 
1. ✅ Security List trong VCN đã mở port 80, 443 (code backend đã có)
2. ❌ **Firewall trên VM** (iptables/ufw/firewalld) đang block ports

---

## ✅ GIẢI PHÁP ĐÃ ÁP DỤNG

### 1️⃣ **Code Backend Đã Update** ✅

File: `src/modules/oci/oci.service.ts`

**Thay đổi**: Thêm commands vào cloud-init để tự động mở firewall ports

**VM mới** sẽ tự động:
- Mở port 22, 80, 443 qua firewall
- Hỗ trợ firewalld (Oracle Linux), ufw (Ubuntu), iptables (fallback)

---

## 🛠️ FIX CHO VM ĐÃ TỒN TẠI

### **Bước 1: SSH vào VM**

```bash
ssh -i your-key.pem ubuntu@<vm-ip>
# hoặc
ssh -i your-key.pem opc@<vm-ip>
```

### **Bước 2: Kiểm Tra Firewall**

#### **Ubuntu (UFW)**:
```bash
# Check status
sudo ufw status

# Nếu active → mở ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Reload
sudo ufw reload

# Verify
sudo ufw status numbered
```

#### **Oracle Linux / CentOS (firewalld)**:
```bash
# Check status
sudo firewall-cmd --state

# Nếu running → mở ports
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp

# Reload
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

#### **Fallback (iptables)**:
```bash
# Check current rules
sudo iptables -L -n -v

# Add rules
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT

# Save rules (Oracle Linux)
sudo service iptables save

# Save rules (Ubuntu)
sudo iptables-save | sudo tee /etc/iptables/rules.v4

# Verify
sudo iptables -L -n -v | grep -E '80|443'
```

### **Bước 3: Test Kết Nối**

```bash
# Test từ trong VM ra internet
curl -I https://google.com

# Test port 80 từ local
curl http://localhost

# Test từ máy khác (thay <vm-ip>)
curl http://<vm-ip>
curl https://<vm-ip>
```

---

## 🔍 VERIFY SECURITY LIST (OCI Console)

Nếu firewall đã mở nhưng vẫn không connect được, check Security List:

### **Bước 1: Vào OCI Console**
1. Đăng nhập https://cloud.oracle.com
2. Networking → Virtual Cloud Networks
3. Click vào VCN của user
4. Security Lists → Click vào Default Security List

### **Bước 2: Check Ingress Rules**

Phải có các rules sau:

| Source CIDR | IP Protocol | Source Port | Destination Port | Description |
|------------|-------------|-------------|------------------|-------------|
| 0.0.0.0/0  | TCP         | All         | 22               | SSH access  |
| 0.0.0.0/0  | TCP         | All         | 80               | HTTP access |
| 0.0.0.0/0  | TCP         | All         | 443              | HTTPS access|

### **Bước 3: Nếu Thiếu Rules**

Code backend đã tự động add khi tạo VCN mới. Nếu VCN cũ thiếu:

```bash
# Trong backend terminal, chạy script update Security List
# (Cần tạo script này nếu cần)
```

Hoặc add thủ công qua OCI Console:
1. Click **Add Ingress Rules**
2. Add HTTP rule:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port: `80`
   - Description: `HTTP access`
3. Add HTTPS rule:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port: `443`
   - Description: `HTTPS access`

---

## 🚀 SCRIPT TỰ ĐỘNG FIX (Cho VM Đã Tồn Tại)

Tạo file `fix-firewall.sh`:

```bash
#!/bin/bash
# Auto fix firewall for web server

echo "🔥 Opening firewall ports 80, 443..."

# Detect firewall type and configure
if command -v firewall-cmd &> /dev/null; then
    echo "📦 Detected: firewalld (Oracle Linux/CentOS)"
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --permanent --add-port=80/tcp
    sudo firewall-cmd --permanent --add-port=443/tcp
    sudo firewall-cmd --reload
    echo "✅ Firewalld configured"
    sudo firewall-cmd --list-all

elif command -v ufw &> /dev/null; then
    echo "📦 Detected: UFW (Ubuntu)"
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    echo "✅ UFW configured"
    sudo ufw status

elif command -v iptables &> /dev/null; then
    echo "📦 Detected: iptables"
    sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT
    sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
    sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
    
    # Try to save rules
    if [ -f /etc/init.d/iptables ]; then
        sudo service iptables save
    elif command -v iptables-save &> /dev/null; then
        sudo iptables-save | sudo tee /etc/iptables/rules.v4
    fi
    echo "✅ IPTables configured"
    sudo iptables -L -n -v | grep -E '80|443'

else
    echo "⚠️  No firewall detected or already open"
fi

echo ""
echo "🧪 Testing connectivity..."
echo "Test local web server:"
curl -I http://localhost 2>&1 | head -n 1

echo ""
echo "✅ Firewall configuration completed!"
echo "💡 Now test from external: curl http://$(hostname -I | awk '{print $1}')"
```

**Cách dùng**:

```bash
# Upload script lên VM hoặc tạo file
nano fix-firewall.sh

# Paste nội dung script vào, save (Ctrl+X, Y, Enter)

# Cho phép execute
chmod +x fix-firewall.sh

# Chạy
./fix-firewall.sh
```

---

## 🎯 CHECKLIST TROUBLESHOOTING

### ✅ **Level 1: VM Firewall**
- [ ] Check firewall status: `sudo ufw status` / `sudo firewall-cmd --state`
- [ ] Open ports 80, 443
- [ ] Test local: `curl http://localhost`

### ✅ **Level 2: OCI Security List**
- [ ] Login OCI Console
- [ ] Check VCN → Security Lists
- [ ] Verify Ingress Rules có port 80, 443
- [ ] Add rules nếu thiếu

### ✅ **Level 3: Web Server**
- [ ] Check nginx/apache running: `sudo systemctl status nginx`
- [ ] Check listening ports: `sudo netstat -tulpn | grep -E '80|443'`
- [ ] Check nginx config: `sudo nginx -t`

### ✅ **Level 4: DNS/Domain**
- [ ] Check DNS resolution: `nslookup chatbot.icss.com.vn`
- [ ] Check domain points to correct IP
- [ ] Test with IP directly: `curl http://<vm-ip>`

---

## 📊 EXPECTED RESULTS

Sau khi fix, từ **bất kỳ máy nào**:

```bash
# Test HTTP
curl -I http://<vm-ip>
# Expected: HTTP/1.1 200 OK (hoặc 301/302 redirect)

# Test HTTPS
curl -I https://<vm-ip>
# Expected: HTTP/2 200 OK (hoặc SSL error nếu chưa có cert)

# Test từ browser
http://<vm-ip>
# Expected: Thấy website
```

Từ **trong VM**:

```bash
# Check ports listening
sudo netstat -tulpn | grep -E '80|443'
# Expected:
# tcp  0  0.0.0.0:80    0.0.0.0:*  LISTEN  12345/nginx
# tcp  0  0.0.0.0:443   0.0.0.0:*  LISTEN  12345/nginx

# Check firewall
sudo iptables -L -n -v | grep -E '80|443'
# Expected: ACCEPT rules for ports 80, 443
```

---

## 🚀 DEPLOYMENT - VM MỚI

Sau khi deploy code mới:

```bash
cd oracle-ics-backend
npm run build
pm2 restart oracle-ics-backend
```

**VM mới** sẽ tự động:
✅ Có sudo NOPASSWD  
✅ Firewall mở port 22, 80, 443  
✅ SSH keys configured  
✅ Packages cần thiết đã cài  

**Test**:
1. Tạo VM mới từ frontend
2. SSH vào: `ssh -i key.pem ubuntu@<vm-ip>`
3. Check firewall: `sudo ufw status` (Ubuntu) / `sudo firewall-cmd --list-all` (Oracle Linux)
4. Verify ports: `sudo netstat -tulpn | grep LISTEN`
5. Cài nginx: `sudo apt install nginx -y` / `sudo yum install nginx -y`
6. Start nginx: `sudo systemctl start nginx`
7. Test: `curl http://<vm-ip>`

---

## 📝 NOTES

1. **Security List** (OCI level) đã được auto-configured khi tạo VCN
2. **VM Firewall** giờ sẽ auto-configured cho VM mới
3. **VM cũ** cần fix thủ công bằng script `fix-firewall.sh`
4. Nếu dùng **custom ports** (8080, 3000...) cần add thêm rules

---

## ⚠️ SECURITY BEST PRACTICES

1. **Chỉ mở ports cần thiết**: 22, 80, 443
2. **Dùng HTTPS** thay vì HTTP khi có thể
3. **Cài SSL certificate** (Let's Encrypt) cho production
4. **Rate limiting** trong nginx/apache
5. **Fail2ban** để chống brute force SSH

