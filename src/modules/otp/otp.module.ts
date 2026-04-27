import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerification } from '../../entities/email-verification.entity';
import { OtpRateLimit } from '../../entities/otp-rate-limit.entity';
import { OtpService } from './otp.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailVerification, OtpRateLimit]),
    EmailModule,
  ],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
