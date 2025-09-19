import { IsString, IsNumber, IsOptional } from 'class-validator';

export class SepayWebhookDto {
  @IsNumber()
  id: number;

  @IsString()
  gateway: string;

  @IsNumber()
  transactionDate: number;

  @IsString()
  accountNumber: string;

  @IsString()
  subAccount: string;

  @IsNumber()
  amountIn: number;

  @IsNumber()
  amountOut: number;

  @IsNumber()
  accumulated: number;

  @IsString()
  code: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsString()
  description: string;
}

export class CreatePaymentDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  packageId: number;

  @IsNumber()
  amount: number;

  @IsString()
  planName: string;
}