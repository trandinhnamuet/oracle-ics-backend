import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDto } from './create-payment.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { PaymentStatus } from '../../../entities/payment.entity';

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  // Enum-checked: with a plain @IsString an admin PATCH could park a payment on
  // an arbitrary status string (e.g. "bogus-status"), which every status filter
  // and badge map then failed to match (QA 2026-09-10, PAY/patch-status-any).
  @IsEnum(PaymentStatus, {
    message: 'status must be one of: pending, success, failed, expired',
  })
  @IsOptional()
  status?: PaymentStatus;
}
