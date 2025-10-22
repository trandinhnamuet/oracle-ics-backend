import { IsNumber, IsNotEmpty, IsOptional, IsBoolean, IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsNumber()
  user_id: number;

  @IsNumber()
  @IsNotEmpty()
  cloud_package_id: number;

  @IsNumber()
  amount_paid: number;

  @IsNumber()
  @IsOptional()
  months_paid?: number;

  @IsBoolean()
  @IsOptional()
  auto_renew?: boolean;

  @IsOptional()
  configuration?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}