export const otpEmailTemplate = (otpCode: string, userName?: string, lang?: string) => {
  const normalizedLang = (lang || '').toLowerCase();
  const isVietnamese = normalizedLang === 'vi' || normalizedLang.startsWith('vi-');

  const subject = isVietnamese
    ? 'Oracle ICS - Ma xac thuc email'
    : 'Oracle ICS - Email Verification Code';

  const htmlLang = isVietnamese ? 'vi' : 'en';
  const title = isVietnamese ? 'Xac thuc Email' : 'Email Verification';
  const greeting = userName
    ? (isVietnamese ? `Xin chao ${userName},` : `Hello ${userName},`)
    : (isVietnamese ? 'Xin chao,' : 'Hello,');
  const message = isVietnamese
    ? 'De hoan tat xac thuc tai khoan, vui long su dung ma 6 so sau:'
    : 'To complete your account verification, please use the following 6-digit code:';
  const codeLabel = isVietnamese ? 'Ma xac thuc cua ban:' : 'Your Verification Code:';
  const warning = isVietnamese
    ? 'Quan trong: Ma nay se het han sau 10 phut. Vui long khong chia se ma nay voi bat ky ai.'
    : 'Important: This code will expire in 10 minutes. Please do not share this code with anyone.';
  const security = isVietnamese
    ? "Thong bao bao mat: Neu ban khong yeu cau ma nay, vui long bo qua email. Bao mat tai khoan cua ban la uu tien hang dau cua chung toi."
    : "Security Notice: If you didn't request this verification code, please ignore this email. Your account security is our priority.";
  const footer = isVietnamese
    ? 'Day la email tu dong tu Oracle ICS.'
    : 'This is an automated message from Oracle ICS.';

  return {
    subject,
    html: `
      <!DOCTYPE html>
      <html lang="${htmlLang}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
          }
          .header {
            text-align: center;
            padding: 20px 0;
            border-bottom: 2px solid #1a73e8;
          }
          .logo {
            color: #1a73e8;
            font-size: 24px;
            font-weight: bold;
          }
          .content {
            padding: 30px 20px;
            text-align: center;
          }
          .greeting {
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
          }
          .message {
            font-size: 16px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
          }
          .otp-container {
            background-color: #f8f9fa;
            border: 2px dashed #1a73e8;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
          }
          .otp-code {
            font-size: 32px;
            font-weight: bold;
            color: #1a73e8;
            letter-spacing: 8px;
            margin: 0;
            font-family: 'Courier New', monospace;
          }
          .otp-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
          }
          .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeeba;
            border-radius: 4px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
            font-size: 14px;
          }
          .footer {
            border-top: 1px solid #eee;
            padding-top: 20px;
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 30px;
          }
          .security-note {
            background-color: #e7f3ff;
            border-left: 4px solid #1a73e8;
            padding: 15px;
            margin: 20px 0;
            font-size: 14px;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Oracle ICS</div>
          </div>
          
          <div class="content">
            <div class="greeting">
              ${greeting}
            </div>
            
            <div class="message">
              ${message}
            </div>
            
            <div class="otp-container">
              <div class="otp-label">${codeLabel}</div>
              <div class="otp-code">${otpCode}</div>
            </div>
            
            <div class="warning">
              <strong>Important:</strong> ${warning}
            </div>
            
            <div class="security-note">
              <strong>Security Notice:</strong> ${security}
            </div>
          </div>
          
          <div class="footer">
            <p>${footer}</p>
            <p>© 2024 Oracle ICS. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
${subject}

${greeting}

${message}

${otpCode}

${warning}

${security}

Oracle ICS Team
    `
  };
};