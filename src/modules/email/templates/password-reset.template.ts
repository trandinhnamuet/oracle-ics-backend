import { PasswordResetData } from '../interfaces/email-options.interface';

export class PasswordResetTemplate {
  static generate(data: PasswordResetData): { subject: string; html: string } {
        const normalizedLang = (data.lang || '').toLowerCase();
        const isVietnamese = normalizedLang === 'vi' || normalizedLang.startsWith('vi-');
        const subject = isVietnamese
            ? 'Mã OTP đặt lại mật khẩu - Oracle ICS'
            : 'Password Reset OTP Code - Oracle ICS';
    const expirationMinutes = data.expirationMinutes || 10;

        const emailTitle = isVietnamese ? 'Đặt lại mật khẩu - Oracle ICS' : 'Reset Password - Oracle ICS';
        const headerTitle = isVietnamese ? 'Đặt lại mật khẩu' : 'Password Reset';
        const greeting = isVietnamese ? 'Chào' : 'Hello';
        const intro1 = isVietnamese
            ? 'Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản Oracle ICS của bạn.'
            : 'We received a request to reset the password for your Oracle ICS account.';
        const intro2 = isVietnamese
            ? 'Vui lòng sử dụng mã OTP dưới đây để xác thực:'
            : 'Please use the OTP code below to verify this request:';
        const otpLabel = isVietnamese ? 'MÃ XÁC THỰC OTP' : 'OTP VERIFICATION CODE';
        const otpExpiry = isVietnamese
            ? `Mã có hiệu lực trong ${expirationMinutes} phút`
            : `This code is valid for ${expirationMinutes} minutes`;
        const guideTitle = isVietnamese ? 'Hướng dẫn đặt lại mật khẩu:' : 'Password reset steps:';
        const guide1 = isVietnamese
            ? 'Nhập mã OTP ở trên vào trang xác thực'
            : 'Enter the OTP code above on the verification page';
        const guide2 = isVietnamese
            ? 'Nhập mật khẩu mới (tối thiểu 6 ký tự)'
            : 'Enter a new password (minimum 6 characters)';
        const guide3 = isVietnamese
            ? 'Xác nhận mật khẩu mới'
            : 'Confirm the new password';
        const guide4 = isVietnamese
            ? 'Đăng nhập lại với mật khẩu mới'
            : 'Sign in with your new password';
        const securityTitle = isVietnamese ? 'Lưu ý bảo mật:' : 'Security notes:';
        const security1 = isVietnamese
            ? 'KHÔNG chia sẻ mã OTP này với bất kỳ ai'
            : 'DO NOT share this OTP code with anyone';
        const security2 = isVietnamese
            ? 'Mã OTP chỉ sử dụng được một lần'
            : 'OTP code can only be used once';
        const security3 = isVietnamese
            ? `Mã sẽ hết hạn sau ${expirationMinutes} phút`
            : `Code will expire after ${expirationMinutes} minutes`;
        const security4 = isVietnamese
            ? 'Đặt mật khẩu mạnh (chữ hoa, chữ thường, số, ký tự đặc biệt)'
            : 'Use a strong password (uppercase, lowercase, number, special character)';
        const warningTitle = isVietnamese
            ? 'Quan trọng: Nếu bạn KHÔNG yêu cầu đặt lại mật khẩu, vui lòng:'
            : 'Important: If you DID NOT request a password reset, please:';
        const warning1 = isVietnamese ? 'Bỏ qua email này' : 'Ignore this email';
        const warning2 = isVietnamese ? 'Liên hệ support@oracle-ics.com ngay lập tức' : 'Contact support@oracle-ics.com immediately';
        const warning3 = isVietnamese ? 'Kiểm tra lại bảo mật tài khoản của bạn' : 'Review your account security';
        const footerLine1 = isVietnamese
            ? 'Email này được gửi tự động từ Oracle ICS System'
            : 'This email was sent automatically by Oracle ICS System';
        const footerLine2 = isVietnamese
            ? 'Nếu cần hỗ trợ, vui lòng liên hệ support@oracle-ics.com'
            : 'If you need help, please contact support@oracle-ics.com';
    
    const html = `
<!doctype html>
<html lang="${isVietnamese ? 'vi' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailTitle}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            padding: 20px;
            border-radius: 10px 10px 0 0;
            margin: -30px -30px 20px -30px;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            margin: 20px 0;
        }
        .otp-box {
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin: 30px 0;
            box-shadow: 0 4px 15px rgba(220,53,69,0.3);
        }
        .otp-box p {
            margin: 5px 0;
            font-size: 14px;
        }
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 10px;
            margin: 20px 0;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .warning-box {
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            color: #721c24;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #eee;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${headerTitle}</h1>
            <p>Oracle ICS System</p>
        </div>
        
        <div class="content">
            <h2>${greeting} ${data.userName}!</h2>
            
            <p>${intro1}</p>
            <p>${intro2}</p>
            
            <div class="otp-box">
                <p>${otpLabel}</p>
                <div class="otp-code">${data.resetCode}</div>
                <p>${otpExpiry}</p>
            </div>
            
            <div class="info-box">
                <h3>${guideTitle}</h3>
                <ol>
                    <li>${guide1}</li>
                    <li>${guide2}</li>
                    <li>${guide3}</li>
                    <li>${guide4}</li>
                </ol>
            </div>
            
            <h3>${securityTitle}</h3>
            <ul>
                <li>${security1}</li>
                <li>${security2}</li>
                <li>${security3}</li>
                <li>${security4}</li>
            </ul>
            
            <div class="warning-box">
                <p><strong>${warningTitle}</strong></p>
                <ul>
                    <li>${warning1}</li>
                    <li>${warning2}</li>
                    <li>${warning3}</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>${footerLine1}</p>
            <p>${footerLine2}</p>
            <p>© 2025 Oracle ICS. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, html };
  }
}