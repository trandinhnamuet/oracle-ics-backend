import { IsNotEmpty, MinLength, MaxLength, IsString, Length, IsOptional, Matches, IsNumber, Min, Max } from 'class-validator';
import { NormalizedEmail } from '../../common/decorators/normalized-email.decorator';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export class LoginDto {
  @NormalizedEmail()
  email: string;

  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class RegisterDto {
  @NormalizedEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, digit and special character' })
  @MaxLength(72, {
    message:
      'Password must be at most 72 characters (bcrypt ignores anything beyond that)',
  })
  password: string;

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;
}

export class VerifyOtpDto {
  @NormalizedEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;
}

export class ResendOtpDto {
  @NormalizedEmail()
  email: string;
}

export class ForgotPasswordDto {
  @NormalizedEmail()
  email: string;
}

export class VerifyResetOtpDto {
  @NormalizedEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;
}

export class ResetPasswordDto {
  @NormalizedEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  otp: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, digit and special character' })
  @MaxLength(72, {
    message:
      'Password must be at most 72 characters (bcrypt ignores anything beyond that)',
  })
  newPassword: string;
}
