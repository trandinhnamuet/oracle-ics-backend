import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUserWalletDto {
  @IsNumber()
  user_id: number;

  @IsNumber()
  @IsOptional()
  balance?: number;

  @IsString()
  @IsOptional()
  currency?: string;
}