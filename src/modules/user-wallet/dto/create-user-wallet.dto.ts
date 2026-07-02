import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateUserWalletDto {
  @IsNumber()
  user_id: number;

  // A wallet can never hold a negative balance.
  @IsNumber()
  @Min(0)
  @IsOptional()
  balance?: number;

  @IsString()
  @IsOptional()
  currency?: string;
}