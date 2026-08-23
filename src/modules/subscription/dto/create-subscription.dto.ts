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

  // No default initializer: UpdateSubscriptionDto = PartialType(CreateSubscriptionDto),
  // and class-transformer copies a field initializer onto every instance, so an admin
  // PATCH /subscriptions/:id that omits auto_renew would silently force it to true and
  // re-enable auto-renew the customer had turned off (Auth-F2). Default is applied in
  // SubscriptionService.create instead.
  @IsBoolean()
  @IsOptional()
  auto_renew?: boolean;

  @IsOptional()
  configuration?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}