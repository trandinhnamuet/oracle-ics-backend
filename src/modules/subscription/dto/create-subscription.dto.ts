import { IsNumber, IsNotEmpty, IsOptional, IsBoolean, IsString, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsNumber()
  user_id: number;

  @IsNumber()
  @IsNotEmpty()
  cloud_package_id: number;

  @IsNumber()
  @Min(0)
  amount_paid: number;

  // Billing cycle length in months — must be at least 1.
  @IsNumber()
  @Min(1)
  @IsOptional()
  months_paid?: number;

  @IsBoolean()
  @IsOptional()
  auto_renew?: boolean = true;

  @IsOptional()
  configuration?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}