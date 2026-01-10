export const otpEmailTemplate = (otpCode: string, userName?: string) => {
  return {
    subject: 'Oracle ICS - Email Verification Code',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
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
              ${userName ? `Hello ${userName},` : 'Hello,'}
            </div>
            
            <div class="message">
              To complete your account verification, please use the following 6-digit code:
            </div>
            
            <div class="otp-container">
              <div class="otp-label">Your Verification Code:</div>
              <div class="otp-code">${otpCode}</div>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important:</strong> This code will expire in 10 minutes. Please do not share this code with anyone.
            </div>
            
            <div class="security-note">
              <strong>🔒 Security Notice:</strong> If you didn't request this verification code, please ignore this email. Your account security is our priority.
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from Oracle ICS.</p>
            <p>© 2024 Oracle ICS. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Oracle ICS - Email Verification

${userName ? `Hello ${userName},` : 'Hello,'}

To complete your account verification, please use the following 6-digit code:

${otpCode}

This code will expire in 10 minutes. Please do not share this code with anyone.

If you didn't request this verification code, please ignore this email.

Oracle ICS Team
    `
  };
};