import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDto } from './create-payment.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  @IsString()
  @IsOptional()
  status?: string;
}