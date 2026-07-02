import { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @IsOptional()
  user_id?: number;

  @IsUUID()
  @IsOptional()
  subscription_id?: string;

  @IsNumber()
  @IsOptional()
  cloud_package_id?: number;

  @IsString()
  @IsNotEmpty()
  payment_method: string;

  @IsString()
  @IsNotEmpty()
  payment_type: string;

  // A payment/deposit amount must be positive. A negative amount on the
  // "Add Funds" flow inflated the user's wallet balance instead of charging
  // them (WSTG-BUSL-01 — Business Logic Data Validation).
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  transaction_code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  metadata?: any;
}