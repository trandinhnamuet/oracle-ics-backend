import { IsUUID, IsNumber, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWalletTransactionDto {
  @IsNumber()
  wallet_id: number;

  @IsUUID()
  payment_id: string;

  @IsNumber()
  change_amount: number;

  @IsNumber()
  @IsOptional()
  balance_after?: number;

  @IsString()
  @IsOptional()
  type?: string;
}