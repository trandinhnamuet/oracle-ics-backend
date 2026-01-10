# 📧 Email Module - Oracle ICS Backend

Module email hoàn chỉnh cho việc gửi email tự động trong hệ thống Oracle ICS.

## 📁 Cấu trúc File

```
src/modules/email/
├── email.module.ts                  # Module chính
├── email.service.ts                 # Service xử lý logic gửi email
├── email.controller.ts              # Controller để test API
├── dto/
│   └── send-email.dto.ts           # DTOs validation
├── templates/
│   ├── test-email.template.ts      # Template email test
│   ├── email-verification.template.ts # Template xác thực email
│   └── password-reset.template.ts  # Template đặt lại mật khẩu
├── interfaces/
│   └── email-options.interface.ts  # Interfaces
└── enums/
    └── email-type.enum.ts          # Enums
```

## 🚀 Cách sử dụng

### 1. Cấu hình Environment Variables

Cập nhật file `.env`:

```bash
# SMTP Configuration - Email Service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@oracle-ics.com
SMTP_FROM_NAME=Oracle ICS System
EMAIL_ENABLE=true
```

**Lưu ý:** 
- Để dùng Gmail, bạn cần tạo App Password (không phải mật khẩu thường)
- Truy cập: Google Account > Security > App passwords

### 2. Test Email Service

Kiểm tra trạng thái email service:

```bash
GET http://localhost:3001/email/status
```

### 3. Gửi Email Test

```bash
POST http://localhost:3001/email/test
Content-Type: application/json

{
  "to": "test@example.com",
  "testMessage": "Đây là tin nhắn test"
}
```

### 4. Gửi Email Xác Thực Đăng Ký

```bash
POST http://localhost:3001/email/verify
Content-Type: application/json

{
  "to": "user@example.com",
  "firstName": "Nguyễn Văn A",
  "verificationLink": "http://localhost:3000/verify-email?token=abc123"
}
```

### 5. Gửi Email Đặt Lại Mật Khẩu

```bash
POST http://localhost:3001/email/reset-password
Content-Type: application/json

{
  "to": "user@example.com",
  "firstName": "Nguyễn Văn A", 
  "resetLink": "http://localhost:3000/reset-password?token=xyz789"
}
```

## 🔧 Sử dụng trong Code

### Trong Auth Service (Đăng ký)

```typescript
// src/auth/auth.service.ts
import { EmailService } from '../modules/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Tạo user...
    const user = await this.userRepository.save(newUser);
    
    // Tạo verification token
    const verificationToken = this.generateToken();
    
    // Gửi email xác thực
    await this.emailService.sendEmailVerification({
      to: user.email,
      firstName: user.firstName,
      verificationLink: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`,
    });

    return user;
  }
}
```

### Trong Password Reset

```typescript
async forgotPassword(email: string) {
  const user = await this.userRepository.findOne({ where: { email } });
  if (!user) throw new Error('User not found');
  
  const resetToken = this.generateResetToken();
  // Lưu token vào database...
  
  // Gửi email reset
  await this.emailService.sendPasswordReset({
    to: user.email,
    firstName: user.firstName,
    resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
  });
  
  return { message: 'Password reset email sent' };
}
```

## 🎨 Email Templates

### 1. Test Email
- **Mục đích:** Kiểm tra hoạt động của email service
- **Nội dung:** Thông báo test thành công, thông tin hệ thống
- **Styling:** Màu xanh lá, icon test

### 2. Email Verification
- **Mục đích:** Xác thực email khi đăng ký
- **Nội dung:** Nút xác thực, hướng dẫn, thời hạn
- **Styling:** Màu xanh dương, icon email
- **Features:** Link backup, countdown timer

### 3. Password Reset
- **Mục đích:** Đặt lại mật khẩu khi quên
- **Nội dung:** Nút reset, cảnh báo bảo mật, hướng dẫn
- **Styling:** Màu đỏ, icon khóa
- **Features:** Cảnh báo bảo mật, thời hạn ngắn (1h)

## 🛠️ API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/email/status` | Kiểm tra trạng thái email service |
| POST | `/email/test` | Gửi email test |
| POST | `/email/verify` | Gửi email xác thực đăng ký |
| POST | `/email/reset-password` | Gửi email đặt lại mật khẩu |

## 📊 Response Format

```json
{
  "success": true,
  "message": "Email sent successfully",
  "timestamp": "2025-11-12T10:30:00.000Z"
}
```

## ❌ Error Handling

Tất cả lỗi được log và trả về format nhất quán:

```json
{
  "success": false,
  "message": "Failed to send email: Connection timeout",
  "timestamp": "2025-11-12T10:30:00.000Z"
}
```

## 🔍 Debugging

### Kiểm tra cấu hình:
```bash
GET /email/status
```

### Log levels:
- `LOG`: Email gửi thành công
- `DEBUG`: Message ID, chi tiết
- `ERROR`: Lỗi gửi email, lỗi kết nối

### Common Issues:

1. **"Email service not initialized"**
   - Kiểm tra SMTP credentials trong .env
   - Verify SMTP_HOST, SMTP_USER, SMTP_PASS

2. **"Authentication failed"**
   - Gmail: Sử dụng App Password thay vì mật khẩu thường
   - Enable 2FA và tạo App Password

3. **"Connection refused"**
   - Kiểm tra SMTP_HOST và SMTP_PORT
   - Firewall có thể block port 587/465

4. **"Template error"**
   - Kiểm tra data truyền vào template
   - Verify firstName, link có đúng format

## 🚀 Production Checklist

- [ ] Cập nhật SMTP credentials production
- [ ] Set `tls.rejectUnauthorized = true`
- [ ] Sử dụng domain email riêng
- [ ] Setup email queue (Redis/Bull) cho volume lớn
- [ ] Monitor email success rate
- [ ] Setup rate limiting
- [ ] Backup SMTP provider

## 📈 Next Steps

1. **Email Queue:** Implement Bull queue cho gửi async
2. **Email Templates:** Thêm templates mới (welcome, subscription, receipt)
3. **Email Tracking:** Track open rate, click rate
4. **Email Analytics:** Dashboard theo dõi email metrics
5. **Multiple Providers:** Fallback SMTP providers

## 💡 Tips

1. **Development:** Sử dụng Mailtrap.io cho test
2. **Styling:** Templates responsive, hỗ trợ dark mode
3. **Security:** Không log sensitive data (passwords, tokens)
4. **Performance:** Email templates có thể cache
5. **UX:** Include plain text version cho email clients cũ

---

**Created:** Nov 12, 2025  
**Author:** GitHub Copilot  
**Version:** 1.0.0