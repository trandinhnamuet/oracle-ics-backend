import { PasswordResetData } from '../interfaces/email-options.interface';

export class PasswordResetTemplate {
  static generate(data: PasswordResetData): { subject: string; html: string } {
    const subject = 'Mã OTP đặt lại mật khẩu - Oracle ICS';
    const expirationMinutes = data.expirationMinutes || 10;
    
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đặt lại mật khẩu - Oracle ICS</title>
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
            <h1>🔐 Đặt lại mật khẩu</h1>
            <p>Oracle ICS System</p>
        </div>
        
        <div class="content">
            <h2>Chào ${data.userName}!</h2>
            
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Oracle ICS của bạn.</p>
            <p>Vui lòng sử dụng mã OTP dưới đây để xác thực:</p>
            
            <div class="otp-box">
                <p>MÃ XÁC THỰC OTP</p>
                <div class="otp-code">${data.resetCode}</div>
                <p>Mã có hiệu lực trong ${expirationMinutes} phút</p>
            </div>
            
            <div class="info-box">
                <h3>📋 Hướng dẫn đặt lại mật khẩu:</h3>
                <ol>
                    <li>Nhập mã OTP trên vào trang xác thực</li>
                    <li>Nhập mật khẩu mới (tối thiểu 6 ký tự)</li>
                    <li>Xác nhận mật khẩu mới</li>
                    <li>Đăng nhập với mật khẩu mới</li>
                </ol>
            </div>
            
            <h3>🔒 Lưu ý bảo mật:</h3>
            <ul>
                <li>❌ <strong>KHÔNG chia sẻ</strong> mã OTP này với bất kỳ ai</li>
                <li>✅ Mã OTP chỉ sử dụng một lần</li>
                <li>✅ Mã sẽ hết hạn sau ${expirationMinutes} phút</li>
                <li>✅ Đặt mật khẩu mạnh (chữ hoa, chữ thường, số, ký tự đặc biệt)</li>
            </ul>
            
            <div class="warning-box">
                <p><strong>⚠️ Quan trọng:</strong> Nếu bạn KHÔNG yêu cầu đặt lại mật khẩu, vui lòng:</p>
                <ul>
                    <li>Bỏ qua email này</li>
                    <li>Liên hệ ngay với support@oracle-ics.com</li>
                    <li>Kiểm tra bảo mật tài khoản</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>Email này được gửi tự động từ Oracle ICS System</p>
            <p>Nếu có thắc mắc, vui lòng liên hệ support@oracle-ics.com</p>
            <p>© 2025 Oracle ICS. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, html };
  }
}