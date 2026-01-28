# Fix Web Terminal SSR Error & WebSocket trên Production

## 🔴 Vấn đề hiện tại

### 1. SSR Error (ĐÃ FIX ✅)
```
ReferenceError: self is not defined
at 18858 (/home/icsadmin/web/oracle/oracle-ics-frontend/.next/server/app/package-management/[subscription_id]/page.js:2:20596)
```

**Nguyên nhân**: TerminalComponent import trực tiếp, Next.js cố render trên server nhưng `xterm.js` và `socket.io-client` chỉ chạy trên browser.

**Giải pháp**: Dùng `dynamic import` với `ssr: false`

### 2. WebSocket Connection Failed  
```
WebSocket connection to 'wss://oraclecloud.vn/socket.io/?EIO=4&transport=websocket' failed
Connection error: Error: timeout
```

**Nguyên nhân**: Nginx chưa proxy WebSocket hoặc backend không accessible.

---

## ✅ Bước 1: Fix SSR Error (ĐÃ HOÀN THÀNH)

Đã sửa file `app/package-management/[subscription_id]/page.tsx`:

```typescript
// ❌ TRƯỚC ĐÂY (Gây SSR error)
import { TerminalComponent } from '@/components/terminal/terminal-component'

// ✅ BÂY GIỜ (Dynamic import, chỉ render client-side)
import dynamic from 'next/dynamic'

const TerminalComponent = dynamic(
  () => import('@/components/terminal/terminal-component').then(mod => ({ default: mod.TerminalComponent })),
  { 
    ssr: false,  // Không render trên server
    loading: () => <div>Loading terminal...</div>
  }
)
```

---

## 🚀 Bước 2: Deploy Code Mới Lên Production

```bash
# SSH vào server
ssh icsadmin@your-production-ip

# Navigate to frontend folder
cd /home/icsadmin/web/oracle/oracle-ics-frontend

# Pull code mới (đã có fix SSR)
git pull

# Clear cache và rebuild
rm -rf .next
npm run build

# Restart PM2
pm2 restart oracle-ics-frontend

# Xem logs để confirm không còn error
pm2 logs oracle-ics-frontend --lines 30
```

**Kiểm tra**: Refresh browser, error "self is not defined" phải biến mất.

---

## 🔧 Bước 3: Fix WebSocket Connection

### 3.1 Kiểm tra Backend

```bash
# Check backend đang chạy
pm2 status | grep oracle-ics-backend

# Check port 3003
sudo netstat -tulnp | grep 3003

# Test Socket.IO endpoint
curl -i http://localhost:3003/socket.io/
# Expected: HTTP/1.1 400 Bad Request (normal cho GET request)
```

### 3.2 Kiểm tra & Fix Nginx Config

```bash
# Xem config hiện tại
sudo cat /etc/nginx/sites-available/oraclecloud.vn | grep -A 10 "location"

# Edit nginx config
sudo nano /etc/nginx/sites-available/oraclecloud.vn
```

**Đảm bảo có đoạn config này**:

```nginx
server {
    listen 443 ssl http2;
    server_name oraclecloud.vn;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/oraclecloud.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oraclecloud.vn/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket support - CRITICAL!
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO WebSocket endpoint - THÊM ĐOẠN NÀY!
    location /socket.io/ {
        proxy_pass http://localhost:3003/socket.io/;
        proxy_http_version 1.1;
        
        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3003/;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Apply changes**:

```bash
# Test nginx config
sudo nginx -t

# Nếu OK, reload
sudo systemctl reload nginx

# Check nginx running
sudo systemctl status nginx
```

### 3.3 Kiểm tra Environment Variables

```bash
cd /home/icsadmin/web/oracle/oracle-ics-frontend

# Xem file .env
cat .env.production.local

# Phải có dòng này:
# NEXT_PUBLIC_BACKEND_URL=https://oraclecloud.vn
```

Nếu **chưa có**, thêm vào:

```bash
echo "NEXT_PUBLIC_BACKEND_URL=https://oraclecloud.vn" >> .env.production.local

# Rebuild sau khi thêm
npm run build
pm2 restart oracle-ics-frontend
```

---

## 🧪 Bước 4: Test Web Terminal

### Test từ Browser

1. Mở **Developer Tools** (F12)
2. Vào tab **Network** > filter "WS" (WebSocket)
3. Truy cập: https://oraclecloud.vn/package-management/[subscription-id]
4. Click **Open Terminal** button

**✅ Thành công nếu thấy**:
- Network tab: `socket.io` connection với status `101 Switching Protocols`
- Console: `Socket connected, starting terminal session...`
- Terminal xuất hiện và có thể gõ lệnh

**❌ Failed nếu thấy**:
- Network tab: connection `failed` hoặc `timeout`
- Console: `Connection error: Error: timeout`

### Test từ Command Line

```bash
# Test WebSocket handshake
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGVzdA==" \
  https://oraclecloud.vn/socket.io/

# Expected: HTTP/1.1 101 Switching Protocols
```

### Xem Backend Logs

```bash
# Real-time logs
pm2 logs oracle-ics-backend --lines 100

# Filter terminal-related
pm2 logs oracle-ics-backend --lines 200 | grep -i "terminal\|socket\|websocket"
```

**Logs mong đợi**:
```
[TerminalGateway] Client connected: [socket-id]
[TerminalGateway] User authenticated: userId=14
🔍 Validating VM access - userId: 14, vmId: 17
✅ VM found: { id: 17, ... }
[TerminalService] SSH connection established
```

---

## ❌ Troubleshooting

### Lỗi 1: Page vẫn crash "self is not defined"

```bash
# Clear cache và rebuild hoàn toàn
cd /home/icsadmin/web/oracle/oracle-ics-frontend
rm -rf .next node_modules
npm install
npm run build
pm2 restart oracle-ics-frontend
```

### Lỗi 2: WebSocket "failed" hoặc "timeout"

**Check 1**: Nginx có location /socket.io/ không?
```bash
sudo nginx -T | grep "location /socket.io"
# Phải có kết quả
```

**Check 2**: Backend có CORS cho domain production không?
```bash
cd /home/icsadmin/web/oracle/oracle-ics-backend
grep -r "oraclecloud.vn" src/
# Phải thấy trong terminal.gateway.ts
```

**Check 3**: Firewall có block không?
```bash
sudo ufw status
# Port 80, 443 phải ALLOW
```

**Check 4**: SSL certificate còn hạn không?
```bash
sudo certbot certificates
```

### Lỗi 3: "VM not found or you do not have access"

```bash
# Xem debug logs từ validateVmAccess
pm2 logs oracle-ics-backend --lines 300 | grep "🔍 Validating"

# Check database
sudo -u postgres psql -d oracle -c "SELECT id, user_id, instance_name FROM vm_instances WHERE id = 17;"
```

---

## 📋 Checklist Deploy

- [ ] Code đã pull và có fix SSR (dynamic import)
- [ ] Frontend đã rebuild: `npm run build`
- [ ] PM2 đã restart: `pm2 restart oracle-ics-frontend`
- [ ] `.env.production.local` có `NEXT_PUBLIC_BACKEND_URL=https://oraclecloud.vn`
- [ ] Nginx config có `location /socket.io/` với WebSocket headers
- [ ] Nginx đã reload: `sudo systemctl reload nginx`
- [ ] Backend đang chạy: `pm2 status`
- [ ] Logs không có error: `pm2 logs --lines 50`
- [ ] Browser test: không còn "self is not defined"
- [ ] Browser test: WebSocket connect thành công
- [ ] Terminal có thể mở và nhận output

---

## 🎯 One-Command Deploy (All-in-One)

```bash
cd /home/icsadmin/web/oracle/oracle-ics-frontend && \
git pull && \
rm -rf .next && \
npm run build && \
pm2 restart oracle-ics-frontend oracle-ics-backend && \
sudo nginx -t && sudo systemctl reload nginx && \
echo "✅ Deploy complete!" && \
sleep 2 && \
pm2 logs --lines 30
```

---

## 📊 Debug Commands

```bash
# 1. Real-time all logs
pm2 logs --lines 50

# 2. Frontend only
pm2 logs oracle-ics-frontend

# 3. Backend only
pm2 logs oracle-ics-backend

# 4. Terminal-related logs
pm2 logs oracle-ics-backend | grep -i "terminal\|socket"

# 5. Nginx access log
sudo tail -f /var/log/nginx/access.log | grep socket.io

# 6. Nginx error log
sudo tail -f /var/log/nginx/error.log

# 7. Check WebSocket connections
sudo netstat -tnp | grep :3003
```

---

## 📞 Support

Nếu vẫn không hoạt động sau khi làm theo tất cả các bước:

1. Gửi logs: `pm2 logs --lines 200 > logs.txt`
2. Gửi nginx config: `sudo nginx -T > nginx-config.txt`
3. Gửi browser console screenshot
4. Gửi browser Network tab (WS filter) screenshot
