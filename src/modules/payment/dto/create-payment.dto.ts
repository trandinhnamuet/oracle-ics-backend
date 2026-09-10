import { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID, Min, Max } from 'class-validator';

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
  //
  // Min is 1 (not 0): @Min(0) let 0 and 0.001 through, creating junk pending
  // orders that round to 0.00 in numeric(15,2) and can then be "accepted".
  // Max keeps the value inside numeric(15,2) — 1e30 used to reach Postgres and
  // surface as a 500 numeric-overflow (QA 2026-09-11, MONEY/dep-*).
  @IsNumber()
  @Min(1)
  @Max(9_999_999_999_999)
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