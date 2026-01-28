# Hướng dẫn sửa lỗi WebSocket trên nginx

## Vấn đề
WebSocket không kết nối được vì nginx chưa được cấu hình để proxy WebSocket requests tới backend.

Browser cố connect: `wss://oraclecloud.vn/socket.io/`
Backend không nhận được request → timeout

## Giải pháp

### Bước 1: Kiểm tra file .env trên production

SSH vào server:
```bash
ssh icsadmin@oraclecloud.vn
```

Kiểm tra .env.production.local:
```bash
cd /home/icsadmin/web/oracle/oracle-ics-frontend
cat .env.production.local
```

**PHẢI có dòng này:**
```
NEXT_PUBLIC_API_URL=https://oraclecloud.vn
```

Nếu chưa có, thêm vào:
```bash
echo "NEXT_PUBLIC_API_URL=https://oraclecloud.vn" >> .env.production.local
```

### Bước 2: Cấu hình nginx để proxy WebSocket

Mở file cấu hình nginx:
```bash
sudo nano /etc/nginx/sites-available/oraclecloud.vn
```

**Thêm location block này TRƯỚC location / {}:**

```nginx
# WebSocket proxy for socket.io
location /socket.io/ {
    proxy_pass http://localhost:3003/socket.io/;
    proxy_http_version 1.1;
    
    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Preserve original request info
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeout settings for WebSocket
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
    
    # Disable buffering for WebSocket
    proxy_buffering off;
}
```

### Bước 3: Test và reload nginx

Test cấu hình:
```bash
sudo nginx -t
```

Nếu OK, reload nginx:
```bash
sudo systemctl reload nginx
```

### Bước 4: Rebuild và restart frontend

```bash
cd /home/icsadmin/web/oracle/oracle-ics-frontend

# Pull code mới nhất
git pull

# Rebuild với environment variable mới
rm -rf .next
npm run build

# Restart PM2
pm2 restart oracle-ics-frontend
```

### Bước 5: Verify logs

Kiểm tra backend có nhận WebSocket connection không:
```bash
pm2 logs oracle-ics-backend --lines 50
```

Khi click vào Terminal button, phải thấy logs như:
```
[TerminalGateway] Client connected: <socket-id>
[TerminalGateway] Starting terminal session for VM: <vm-id>
```

## Test WebSocket connection

Từ browser console:
```javascript
// Test WebSocket handshake
fetch('https://oraclecloud.vn/socket.io/?EIO=4&transport=polling')
  .then(r => r.text())
  .then(console.log)
```

Hoặc dùng curl:
```bash
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     https://oraclecloud.vn/socket.io/
```

## Nếu vẫn lỗi

### Kiểm tra backend có chạy không:
```bash
pm2 status
pm2 logs oracle-ics-backend --lines 20
```

### Kiểm tra port 3003:
```bash
sudo netstat -tlnp | grep 3003
```

### Kiểm tra firewall:
```bash
sudo ufw status
# Đảm bảo port 80, 443 mở
```

### Xem nginx error log:
```bash
sudo tail -f /var/log/nginx/error.log
```

## File nginx config mẫu đầy đủ

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name oraclecloud.vn www.oraclecloud.vn;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name oraclecloud.vn www.oraclecloud.vn;

    # SSL certificates (từ Certbot)
    ssl_certificate /etc/letsencrypt/live/oraclecloud.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oraclecloud.vn/privkey.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # WebSocket proxy for socket.io - PHẢI ĐẶT TRƯỚC /api/
    location /socket.io/ {
        proxy_pass http://localhost:3003/socket.io/;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://localhost:3003/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend Next.js application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
```

## Summary

1. ✅ Set `NEXT_PUBLIC_API_URL=https://oraclecloud.vn` trong .env.production.local
2. ✅ Thêm `location /socket.io/` block vào nginx config
3. ✅ Reload nginx: `sudo systemctl reload nginx`
4. ✅ Rebuild frontend: `rm -rf .next && npm run build`
5. ✅ Restart PM2: `pm2 restart oracle-ics-frontend`
6. ✅ Test terminal button - phải thấy WebSocket connected!
