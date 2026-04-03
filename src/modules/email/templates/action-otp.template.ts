export type ActionOtpType = 'request-key' | 'reset-password';

export interface ActionOtpData {
  lang?: string;
  userName: string;
  otpCode: string;
  action: ActionOtpType;
  expirationMinutes?: number;
}

export class ActionOtpTemplate {
  static generate(data: ActionOtpData): { subject: string; html: string } {
    const isVi = (data.lang || '').trim().toLowerCase().startsWith('vi');
    const expMin = data.expirationMinutes ?? 10;
    const isReset = data.action === 'reset-password';

    const subject = isVi
      ? (isReset
        ? 'Mã OTP xác nhận đặt lại mật khẩu Windows VM'
        : 'Mã OTP xác nhận tạo SSH Key mới')
      : (isReset
        ? 'OTP Code – Windows VM Password Reset Confirmation'
        : 'OTP Code – New SSH Key Request Confirmation');

    const title = isVi
      ? (isReset ? 'Xác Nhận Đặt Lại Mật Khẩu VM' : 'Xác Nhận Tạo SSH Key Mới')
      : (isReset ? 'Confirm VM Password Reset' : 'Confirm New SSH Key Request');

    const headerBg = isReset
      ? 'linear-gradient(135deg, #0078D4 0%, #005a9e 100%)'
      : 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)';

    const borderColor = isReset ? '#0078D4' : '#28a745';

    const actionIcon = isReset ? '🔑' : '🗝️';

    const greeting = isVi
      ? `Xin chào <strong>${data.userName}</strong>,`
      : `Hello <strong>${data.userName}</strong>,`;

    const intro = isVi
      ? (isReset
        ? 'Chúng tôi nhận được yêu cầu <strong>đặt lại mật khẩu Windows VM</strong> từ tài khoản của bạn. Vui lòng sử dụng mã OTP bên dưới để xác nhận thao tác này.'
        : 'Chúng tôi nhận được yêu cầu <strong>tạo SSH Key mới</strong> cho VM Linux của bạn. Vui lòng sử dụng mã OTP bên dưới để xác nhận thao tác này.')
      : (isReset
        ? 'We received a request to <strong>reset the Windows VM password</strong> on your account. Please use the OTP code below to confirm this action.'
        : 'We received a request to <strong>generate a new SSH Key</strong> for your Linux VM. Please use the OTP code below to confirm this action.');

    const otpLabel = isVi ? 'MÃ XÁC THỰC OTP' : 'OTP VERIFICATION CODE';
    const otpExpiry = isVi
      ? `Mã có hiệu lực trong ${expMin} phút`
      : `Valid for ${expMin} minutes`;

    const noteTitle = isVi ? '⚠️ Lưu ý quan trọng:' : '⚠️ Important notes:';
    const notes = isVi
      ? [
          `Mã OTP sẽ hết hạn sau <strong>${expMin} phút</strong>`,
          'Không chia sẻ mã này với bất kỳ ai',
          'Mã chỉ sử dụng được <strong>một lần duy nhất</strong>',
          'Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email này',
        ]
      : [
          `This OTP code expires in <strong>${expMin} minutes</strong>`,
          'Never share this code with anyone',
          'This code can only be used <strong>once</strong>',
          'If you did not make this request, please ignore this email',
        ];

    const footer1 = isVi
      ? 'Email được gửi tự động từ Oracle Cloud Management Platform'
      : 'This email was sent automatically by Oracle Cloud Management Platform';
    const footer2 = isVi
      ? 'Nếu cần hỗ trợ, vui lòng liên hệ support@oraclecloud.vn'
      : 'If you need help, please contact support@oraclecloud.vn';

    const html = `<!DOCTYPE html>
<html lang="${isVi ? 'vi' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: ${headerBg};
      color: #ffffff;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .content {
      padding: 30px;
    }
    .otp-box {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-align: center;
      padding: 30px;
      border-radius: 10px;
      margin: 25px 0;
      box-shadow: 0 4px 15px rgba(102,126,234,0.4);
    }
    .otp-label {
      margin: 0;
      font-size: 13px;
      letter-spacing: 2px;
      opacity: 0.9;
    }
    .otp-code {
      font-size: 52px;
      font-weight: bold;
      letter-spacing: 14px;
      font-family: 'Courier New', monospace;
      margin: 12px 0;
    }
    .otp-expiry {
      margin: 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid ${borderColor};
      padding: 16px 20px;
      margin: 20px 0;
      border-radius: 0 6px 6px 0;
    }
    .info-box strong {
      display: block;
      margin-bottom: 8px;
    }
    .info-box ul {
      margin: 0;
      padding-left: 20px;
    }
    .info-box ul li {
      margin-bottom: 6px;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      padding: 20px 30px;
      border-top: 1px solid #eee;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${actionIcon} ${title}</h1>
      <p>Oracle Cloud Management Platform</p>
    </div>

    <div class="content">
      <p>${greeting}</p>
      <p>${intro}</p>

      <div class="otp-box">
        <p class="otp-label">${otpLabel}</p>
        <div class="otp-code">${data.otpCode}</div>
        <p class="otp-expiry">${otpExpiry}</p>
      </div>

      <div class="info-box">
        <strong>${noteTitle}</strong>
        <ul>
          ${notes.map(n => `<li>${n}</li>`).join('\n          ')}
        </ul>
      </div>
    </div>

    <div class="footer">
      <p>${footer1}</p>
      <p>${footer2}</p>
      <p>© 2026 Oracle Cloud Management Platform</p>
    </div>
  </div>
</body>
</html>`;

    return { subject, html };
  }
}
