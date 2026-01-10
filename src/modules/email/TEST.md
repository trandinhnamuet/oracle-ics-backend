# 🧪 Test Email Module

## Quick Test Commands

### 1. Test Email Service Status
```bash
curl -X GET http://localhost:3001/email/status
```

### 2. Send Test Email
```bash
curl -X POST http://localhost:3001/email/test \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "testMessage": "Hello from Oracle ICS!"
  }'
```

### 3. Send Email Verification
```bash
curl -X POST http://localhost:3001/email/verify \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "firstName": "Nguyễn Văn A",
    "verificationLink": "http://localhost:3000/verify-email?token=sample-token-123"
  }'
```

### 4. Send Password Reset
```bash
curl -X POST http://localhost:3001/email/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com", 
    "firstName": "Nguyễn Văn A",
    "resetLink": "http://localhost:3000/reset-password?token=sample-reset-token-456"
  }'
```
  
## ⚙️ Before Testing

1. **Update .env file:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-real-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@oracle-ics.com
SMTP_FROM_NAME=Oracle ICS System
```

2. **Start the server:**
```bash
npm run start:dev
```

3. **Test với Postman hoặc curl**

## 📧 Gmail Setup

1. Enable 2FA on your Gmail account
2. Go to Google Account Settings > Security > App Passwords  
3. Generate an App Password
4. Use that App Password in SMTP_PASS (not your regular password)

## Expected Results

✅ **Success Response:**
```json
{
  "success": true,
  "message": "Email sent successfully to user@example.com",
  "timestamp": "2025-11-12T10:30:00.000Z"
}
```

❌ **Error Response:**
```json
{
  "success": false,
  "message": "Failed to send email: Authentication failed",
  "timestamp": "2025-11-12T10:30:00.000Z"
}
```