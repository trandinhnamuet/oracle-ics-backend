import { TestEmailData } from '../interfaces/email-options.interface';

export class TestEmailTemplate {
  static generate(data: TestEmailData): { subject: string; html: string } {
    const subject = 'Test Email từ Oracle ICS System';
    
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Email - Oracle ICS</title>
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
        .test-badge {
            background-color: #28a745;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            display: inline-block;
            font-weight: bold;
            margin: 20px 0;
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
            <h1>🧪 Test Email</h1>
            <p>Oracle ICS System</p>
        </div>
        
        <div class="content">
            <div class="test-badge">✅ EMAIL MODULE HOẠT ĐỘNG THÀNH CÔNG</div>
            
            <h2>Chào bạn!</h2>
            
            <p>Đây là email test từ Oracle ICS System để kiểm tra chức năng gửi email.</p>
            
            <div class="info-box">
                <h3>📧 Thông tin email test:</h3>
                <ul>
                    <li><strong>Gửi đến:</strong> ${data.to}</li>
                    <li><strong>Thời gian:</strong> ${new Date().toLocaleString('vi-VN')}</li>
                    <li><strong>Hệ thống:</strong> Oracle ICS Backend</li>
                    ${data.testMessage ? `<li><strong>Tin nhắn:</strong> ${data.testMessage}</li>` : ''}
                </ul>
            </div>
            
            <p>Nếu bạn nhận được email này, chứng tỏ hệ thống email đang hoạt động bình thường.</p>
            
            <h3>🎯 Chức năng đã test:</h3>
            <ul>
                <li>✅ Kết nối SMTP</li>
                <li>✅ Gửi email HTML</li>
                <li>✅ Template engine</li>
                <li>✅ Email styling</li>
            </ul>
        </div>
        
        <div class="footer">
            <p>Email này được gửi tự động từ Oracle ICS System</p>
            <p>© 2025 Oracle ICS. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    return { subject, html };
  }
}