import { IsEmail, IsString, IsOptional, IsArray } from 'class-validator';

export class SendEmailDto {
  @IsEmail({}, { each: true })
  to: string | string[];

  @IsString()
  subject: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsArray()
  @IsOptional()
  attachments?: any[];
}

export class TestEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsOptional()
  testMessage?: string;
}

export class EmailVerificationDto {
  @IsEmail()
  to: string;

  @IsString()
  userName: string;

  @IsString()
  verificationCode: string;

  @IsOptional()
  expirationMinutes?: number;
}

export class PasswordResetDto {
  @IsEmail()
  to: string;

  @IsString()
  userName: string;

  @IsString()
  resetCode: string;

  @IsOptional()
  expirationMinutes?: number;
}