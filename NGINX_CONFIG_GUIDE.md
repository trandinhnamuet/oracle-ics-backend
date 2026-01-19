# Hướng dẫn cấu hình Nginx cho Oracle ICS Backend

## Vấn đề
Khi deploy ứng dụng sau Nginx hoặc Load Balancer, backend nhận IP là `127.0.0.1` (localhost) thay vì địa chỉ IP thực của client, dẫn đến:
- Lịch sử đăng nhập hiển thị IP: `127.0.0.1`
- Location hiển thị: `Localhost, Local`

## Nguyên nhân
- Nginx/Load Balancer đóng vai trò proxy, tạo connection mới đến backend
- Backend nhận IP của proxy (127.0.0.1) thay vì IP của client
- Cần cấu hình Nginx truyền IP thực qua headers `X-Forwarded-For`, `X-Real-IP`

## Giải pháp

### 1. Cấu hình Nginx (nginx.conf hoặc site config)

```nginx
server {
    listen 80;
    server_name api.oraclecloud.vn;  # Thay bằng domain của bạn

    location / {
        proxy_pass http://localhost:3003;  # Backend Node.js
        
        # CRITICAL: Truyền IP thực của client
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Headers khác
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering off;
        proxy_http_version 1.1;
    }
}
```

### 2. Nếu dùng HTTPS với SSL

```nginx
server {
    listen 443 ssl http2;
    server_name api.oraclecloud.vn;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:3003;
        
        # CRITICAL: Truyền IP thực
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_http_version 1.1;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.oraclecloud.vn;
    return 301 https://$server_name$request_uri;
}
```

### 3. Nếu đằng sau nhiều tầng proxy (Cloudflare + Nginx)

```nginx
# Thêm vào http block trong nginx.conf
http {
    # Trust Cloudflare IPs
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2c0f:f248::/32;
    set_real_ip_from 2a06:98c0::/29;
    
    real_ip_header CF-Connecting-IP;
    # hoặc: real_ip_header X-Forwarded-For;
}
```

## Kiểm tra cấu hình

### 1. Test Nginx config
```bash
sudo nginx -t
```

### 2. Reload Nginx
```bash
sudo systemctl reload nginx
# hoặc
sudo service nginx reload
```

### 3. Kiểm tra logs backend
```bash
# Xem logs để kiểm tra IP được extract
pm2 logs oracle-ics-backend
# hoặc
tail -f /path/to/logs
```

### 4. Test API endpoint
```bash
# Gọi API login và kiểm tra response
curl -X POST https://api.oraclecloud.vn/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

## Các Headers quan trọng

| Header | Mô tả | Ưu tiên |
|--------|-------|---------|
| `X-Forwarded-For` | Danh sách IP qua các proxy (client, proxy1, proxy2...) | 1 |
| `X-Real-IP` | IP thực của client (Nginx) | 2 |
| `CF-Connecting-IP` | IP thực của client (Cloudflare) | 3 |
| `X-Client-IP` | IP client (một số proxy) | 4 |

## Code đã fix

Backend code đã được cập nhật để:
1. ✅ Lấy IP từ `X-Forwarded-For` header (ưu tiên)
2. ✅ Lấy IP từ `X-Real-IP` header
3. ✅ Lấy IP từ `CF-Connecting-IP` header (Cloudflare)
4. ✅ Trust proxy trong Express (`app.set('trust proxy', true)`)
5. ✅ Log chi tiết IP được extract
6. ✅ Xử lý đúng IPv4/IPv6

## Lưu ý quan trọng

1. **PHẢI restart backend** sau khi fix code:
   ```bash
   pm2 restart oracle-ics-backend
   # hoặc
   npm run start:prod
   ```

2. **PHẢI reload Nginx** sau khi sửa config:
   ```bash
   sudo systemctl reload nginx
   ```

3. **Kiểm tra firewall** không chặn headers:
   ```bash
   # AWS Security Group, iptables, etc.
   ```

4. **Nếu dùng Docker**: Đảm bảo network mode đúng
   ```yaml
   # docker-compose.yml
   services:
     backend:
       network_mode: "host"
       # hoặc
       extra_hosts:
         - "host.docker.internal:host-gateway"
   ```

## Troubleshooting

### Vẫn thấy 127.0.0.1?
1. Kiểm tra Nginx config có `proxy_set_header X-Forwarded-For`
2. Kiểm tra backend có `app.set('trust proxy', true)`
3. Restart cả Nginx và Backend
4. Kiểm tra logs để xem headers nào được nhận

### Location vẫn hiển thị "Localhost, Local"?
- Đảm bảo IP không phải 127.0.0.1 hoặc private IP
- Kiểm tra geoip-lite database đã cập nhật:
  ```bash
  npm update geoip-lite
  ```

### Headers không được truyền?
```bash
# Test headers được gửi từ Nginx
curl -H "X-Forwarded-For: 1.2.3.4" http://localhost:3003/auth/login
```
