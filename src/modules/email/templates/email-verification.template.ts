import { EmailVerificationData } from '../interfaces/email-options.interface';

export class EmailVerificationTemplate {
  static generate(data: EmailVerificationData): { subject: string; html: string } {
    const subject = 'Mã xác thực OTP đăng ký - Oracle ICS';
    const expirationMinutes = data.expirationMinutes || 10;
    
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xác thực Email - Oracle ICS</title>
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
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
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
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px;
            margin: 30px 0;
            box-shadow: 0 4px 15px rgba(0,123,255,0.3);
        }
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 10px;
            margin: 15px 0;
            font-family: 'Courier New', monospace;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #007bff;
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
            <h1>✉️ Xác thực Email</h1>
            <p>Oracle ICS System</p>
        </div>
        
        <div class="content">
            <h2>Chào ${data.userName}!</h2>
            
            <p>Cảm ơn bạn đã đăng ký tài khoản tại <strong>Oracle ICS</strong>. Để hoàn tất quá trình đăng ký, vui lòng sử dụng mã OTP dưới đây:</p>
            
            <div class="otp-box">
                <p style="margin: 0; font-size: 16px;">MÃ XÁC THỰC OTP</p>
                <div class="otp-code">${data.verificationCode}</div>
                <p style="margin: 0; font-size: 14px;">Mã có hiệu lực trong ${expirationMinutes} phút</p>
            </div>
            
            <div class="info-box">
                <h3>📌 Lưu ý quan trọng:</h3>
                <ul>
                    <li>Mã OTP sẽ hết hạn sau <strong>${expirationMinutes} phút</strong></li>
                    <li>Không chia sẻ mã này với bất kỳ ai</li>
                    <li>Sau khi xác thực, bạn có thể đăng nhập vào hệ thống</li>
                </ul>
            </div>
            
            <p><strong>Lưu ý:</strong> Nếu bạn không phải người đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
        </div>
        
        <div class="footer">
            <p>Email này được gửi tự động từ Oracle ICS System</p>
            <p>Nếu có thắc mắc, vui lòng liên hệ support@oracle-ics.com</p>
            <p>© 2026 Oracle ICS. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, html };
  }
}