# 🌐 Fix: Mở Port 80, 443 Cho Web Server

## 📌 TL;DR - Giải Pháp Nhanh

**VM Mới** (tạo sau khi deploy): ✅ Tự động mở port 22, 80, 443  
**VM Cũ** (đã tồn tại): Chạy script fix thủ công

---

## ✅ ĐÃ FIX - VM MỚI TỰ ĐỘNG MỞ PORTS

### **Code Backend Đã Update**

File: `src/modules/oci/oci.service.ts` (dòng 810-870)

**Thay đổi**: Cloud-init tự động mở firewall ports khi VM boot lần đầu

**VM mới sẽ tự động**:
- ✅ Mở port 22 (SSH)
- ✅ Mở port 80 (HTTP)
- ✅ Mở port 443 (HTTPS)
- ✅ Hỗ trợ firewalld (Oracle Linux), ufw (Ubuntu), iptables

**Deploy code mới**:
```bash
cd oracle-ics-backend
npm run build
pm2 restart oracle-ics-backend
```

---

## 🛠️ FIX VM CŨ - 3 CÁCH

### **Cách 1: Chạy Script Tự Động** (Khuyên dùng ⭐)

```bash
# SSH vào VM
ssh -i key.pem ubuntu@<vm-ip>

# Download script
curl -O https://raw.githubusercontent.com/your-repo/scripts/fix-firewall.sh
# Hoặc copy từ backend: oracle-ics-backend/scripts/fix-firewall.sh

# Chạy script
sudo bash fix-firewall.sh
```

Script sẽ tự động:
- Detect hệ thống firewall (firewalld/ufw/iptables)
- Mở ports 22, 80, 443
- Test connectivity
- Hiển thị hướng dẫn cài nginx

### **Cách 2: Ubuntu (UFW) - Manual**

```bash
ssh -i key.pem ubuntu@<vm-ip>

# Mở ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### **Cách 3: Oracle Linux (firewalld) - Manual**

```bash
ssh -i key.pem opc@<vm-ip>

# Mở ports
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp

# Reload
sudo firewall-cmd --reload

# Check status
sudo firewall-cmd --list-all
```

---

## 🧪 TEST KẾT QUẢ

### **1. Test từ trong VM**

```bash
# Check ports listening
sudo netstat -tulpn | grep -E '80|443'
# Expected: nginx listening on 80, 443

# Check firewall rules
sudo ufw status          # Ubuntu
sudo firewall-cmd --list-all  # Oracle Linux

# Test local
curl http://localhost
```

### **2. Test từ bên ngoài**

```bash
# Từ máy khác
curl -I http://<vm-ip>
curl -I https://<vm-ip>

# Hoặc mở browser
http://<vm-ip>
```

**Expected Result**:
- ✅ HTTP/1.1 200 OK (hoặc 301/302)
- ✅ Thấy website content
- ❌ **KHÔNG** "Connection refused" hoặc "No route to host"

---

## 📊 TROUBLESHOOTING

### Vấn đề: Vẫn không connect được sau khi mở firewall

**Check 1: OCI Security List**
```
1. Login OCI Console: https://cloud.oracle.com
2. Networking → Virtual Cloud Networks
3. Click VCN → Security Lists → Default Security List
4. Check Ingress Rules có port 80, 443 chưa
```

Phải có rules:
- Source: `0.0.0.0/0`, Protocol: `TCP`, Port: `80`
- Source: `0.0.0.0/0`, Protocol: `TCP`, Port: `443`

**Check 2: Web Server Running?**
```bash
sudo systemctl status nginx
# Nếu không chạy
sudo systemctl start nginx
sudo systemctl enable nginx
```

**Check 3: Nginx Config OK?**
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

**Check 4: Port Bindings**
```bash
sudo netstat -tulpn | grep nginx
# Expected: nginx listening on 0.0.0.0:80, 0.0.0.0:443
```

---

## 📝 FILES LIÊN QUAN

- **Cloud-init config**: `oracle-ics-backend/src/modules/oci/oci.service.ts`
- **Fix script**: `oracle-ics-backend/scripts/fix-firewall.sh`
- **Chi tiết**: `oracle-ics-backend/FIX_FIREWALL_PORTS.md`

---

## 🎯 CHECKLIST DEPLOYMENT

**Backend Developer**:
- [x] Update cloud-init config in oci.service.ts
- [x] Add firewall commands to runcmd
- [x] Test với VM mới
- [ ] Deploy lên production server
- [ ] Test tạo VM mới và verify ports

**User (VM cũ)**:
- [ ] SSH vào VM
- [ ] Chạy script fix-firewall.sh
- [ ] Test curl http://vm-ip
- [ ] Cài nginx nếu chưa có
- [ ] Configure nginx cho domain

---

## ⚡ QUICK COMMANDS

```bash
# Ubuntu - Mở ports nhanh
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

# Oracle Linux - Mở ports nhanh  
sudo firewall-cmd --permanent --add-port={80,443}/tcp && sudo firewall-cmd --reload

# Install nginx
sudo apt install nginx -y     # Ubuntu
sudo yum install nginx -y     # Oracle Linux

# Start nginx
sudo systemctl start nginx && sudo systemctl enable nginx

# Test
curl http://localhost
```

---

## 🔐 SECURITY NOTES

1. **Port 22**: Chỉ mở cho SSH (bắt buộc)
2. **Port 80**: HTTP (recommend redirect to HTTPS)
3. **Port 443**: HTTPS (recommend install SSL cert)
4. **Custom ports**: Nếu app chạy port khác (8080, 3000...), cần add thêm rules

**Best Practice**:
- Dùng Let's Encrypt cho SSL certificate (miễn phí)
- Setup nginx reverse proxy
- Enable rate limiting
- Install fail2ban cho SSH protection

