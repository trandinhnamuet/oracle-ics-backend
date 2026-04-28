import { IsEmail, IsNotEmpty, MinLength, IsString, Length, IsOptional, Matches } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export class LoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, digit and special character' })
  password: string;

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;
}

export class ResendOtpDto {
  @IsEmail()
  email: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class VerifyResetOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, digit and special character' })
  newPassword: string;
}
