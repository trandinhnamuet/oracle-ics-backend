export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: any[];
}

export interface EmailTemplateData {
  to: string;
  [key: string]: any;
}

export interface TestEmailData extends EmailTemplateData {
  to: string;
  testMessage?: string;
}

export interface EmailVerificationData extends EmailTemplateData {
  to: string;
  userName: string;
  verificationCode: string;
  expirationMinutes?: number;
}

export interface PasswordResetData extends EmailTemplateData {
  to: string;
  userName: string;
  resetCode: string;
  expirationMinutes?: number;
}

export interface WelcomeEmailData extends EmailTemplateData {
  to: string;
  firstName: string;
  lastName?: string;
  companyName?: string;
}