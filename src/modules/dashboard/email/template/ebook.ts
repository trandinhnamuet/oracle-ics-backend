import { RegistrationRequests } from '../../registration-requests/registration-requests.entity';
import { escapeHtml } from '../../../../utils/html.util';

export function getEbookTemplate(data: RegistrationRequests): string {
    return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chào mừng đến với Smart Dashboard</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: bold;
            }
            .content {
                padding: 40px 30px;
            }
            .welcome-text {
                font-size: 18px;
                margin-bottom: 20px;
                color: #2c3e50;
            }
            .info-box {
                background: #f8f9fa;
                border-left: 4px solid #667eea;
                padding: 20px;
                margin: 20px 0;
                border-radius: 5px;
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
                padding: 5px 0;
                border-bottom: 1px solid #eee;
            }
            .info-row:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            .label {
                font-weight: bold;
                color: #34495e;
            }
            .value {
                color: #667eea;
                font-weight: 500;
            }
            .ebook-section {
                background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%);
                padding: 25px;
                margin: 30px 0;
                border-radius: 10px;
                text-align: center;
            }
            .ebook-title {
                font-size: 22px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 15px;
            }
            .ebook-description {
                font-size: 16px;
                color: #34495e;
                margin-bottom: 20px;
            }
            .attachment-info {
                background: #e8f5e8;
                padding: 15px;
                border-radius: 5px;
                color: #27ae60;
                font-weight: bold;
            }
            .footer {
                background: #34495e;
                color: white;
                padding: 25px;
                text-align: center;
            }
            .footer p {
                margin: 5px 0;
            }
            .highlight {
                color: #667eea;
                font-weight: bold;
            }
            .plan-highlight {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 15px;
                border-radius: 8px;
                margin: 15px 0;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Chào mừng đến với Smart Dashboard!</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Bảng điều khiển thông minh cho tương lai</p>
            </div>
            
            <div class="content">
                <p class="welcome-text">
                    Xin chào <span class="highlight">${escapeHtml(data.user_name)}</span>,
                </p>
                
                <p>Cảm ơn bạn đã đăng ký sử dụng <strong>Smart Dashboard</strong>! Chúng tôi rất vui mừng chào đón bạn tham gia cộng đồng những người tiên phong trong việc sử dụng công nghệ bảng điều khiển thông minh.</p>
                
                <div class="info-box">
                    <h3 style="margin-top: 0; color: #2c3e50;">📋 Thông tin đăng ký của bạn:</h3>
                    <div class="info-row">
                        <span class="label">Họ và tên:</span>
                        <span class="value">${escapeHtml(data.user_name)}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Email:</span>
                        <span class="value">${escapeHtml(data.email)}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Số điện thoại:</span>
                        <span class="value">${escapeHtml(data.phone_number)}</span>
                    </div>
                    ${data.company ? `
                    <div class="info-row">
                        <span class="label">Công ty:</span>
                        <span class="value">${escapeHtml(data.company)}</span>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <span class="label">Đăng ký lúc:</span>
                        <span class="value">${new Date(data.submitted_at).toLocaleString('vi-VN')}</span>
                    </div>
                </div>

                <div class="plan-highlight">
                    <h3 style="margin: 0 0 10px 0;">🚀 Gói đã chọn: ${escapeHtml(data.plan_name)}</h3>
                    ${data.plan_description ? `<p style="margin: 5px 0; opacity: 0.9;">${escapeHtml(data.plan_description)}</p>` : ''}
                    ${data.plan_price ? `<p style="margin: 5px 0; font-size: 18px; font-weight: bold;">Giá: ${escapeHtml(data.plan_price)}</p>` : ''}
                </div>

                ${data.additional_notes ? `
                <div class="info-box">
                    <h4 style="margin-top: 0; color: #2c3e50;">💬 Ghi chú thêm:</h4>
                    <p style="margin-bottom: 0; font-style: italic;">${escapeHtml(data.additional_notes)}</p>
                </div>
                ` : ''}
                
                <div class="ebook-section">
                    <div class="ebook-title">🎁 Quà tặng đặc biệt dành cho bạn!</div>
                    <div class="ebook-description">
                        Chúng tôi gửi tặng bạn một cuốn <strong>Ebook hướng dẫn Smart Dashboard</strong> 
                        với đầy đủ kiến thức và kỹ thuật để tối ưu hóa việc sử dụng bảng điều khiển thông minh.
                    </div>
                    <div class="attachment-info">
                        📎 Vui lòng kiểm tra file đính kèm: <strong>Smart_Dashboard_Guide.pdf</strong>
                    </div>
                </div>
                
                <h3 style="color: #2c3e50;">🔥 Những tính năng nổi bật bạn sẽ được trải nghiệm:</h3>
                <ul style="color: #34495e; padding-left: 20px;">
                    <li>✅ Dashboard tùy chỉnh theo nhu cầu</li>
                    <li>✅ Báo cáo thống kê realtime</li>
                    <li>✅ Thông báo thông minh</li>
                    <li>✅ Giao diện responsive trên mọi thiết bị</li>
                    <li>✅ Bảo mật cao cấp</li>
                    <li>✅ Hỗ trợ kỹ thuật 24/7</li>
                </ul>
                
                <p>Đội ngũ chúng tôi sẽ liên hệ với bạn trong thời gian sớm nhất để hỗ trợ quá trình thiết lập và sử dụng hệ thống.</p>
                
                <p><strong>Một lần nữa, chúng tôi chân thành cảm ơn sự tin tưởng của bạn!</strong></p>
            </div>
            
            <div class="footer">
                <p><strong>Smart Dashboard Team</strong></p>
                <p>📧 Email: support@smartdashboard.com | 📞 Hotline: 1900-xxxx</p>
                <p>🌐 Website: www.smartdashboard.com</p>
                <p style="font-size: 12px; opacity: 0.8; margin-top: 15px;">
                    © 2025 Smart Dashboard. Tất cả quyền được bảo lưu.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}