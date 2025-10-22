import { IsUUID, IsNumber, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSubscriptionLogDto {
  @IsUUID()
  subscription_id: string;

  @IsNumber()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsOptional()
  status_old?: string;

  @IsString()
  @IsOptional()
  status_new?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  metadata?: any;
}