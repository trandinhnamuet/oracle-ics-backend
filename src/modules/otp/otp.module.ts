import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerification } from '../../entities/email-verification.entity';
import { OtpService } from './otp.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailVerification]),
    EmailModule,
  ],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}