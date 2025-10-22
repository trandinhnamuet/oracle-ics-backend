import { IsString, IsNotEmpty, IsOptional, IsNumber, IsUUID } from 'class-validator';

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

  @IsNumber()
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