import { IsString, Length, Matches } from 'class-validator';
import { NormalizedEmail } from '../../common/decorators/normalized-email.decorator';

export class VerifyOtpDto {
  @NormalizedEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP code must contain only numbers' })
  otpCode: string;
}

export class ResendOtpDto {
  @NormalizedEmail()
  email: string;
}