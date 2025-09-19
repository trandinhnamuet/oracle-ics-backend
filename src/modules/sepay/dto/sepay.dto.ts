import { IsString, IsNumber, IsOptional } from 'class-validator';

export class SepayWebhookDto {
  @IsNumber()
  id: number;

  @IsString()
  gateway: string;

  @IsString()
  transactionDate: string;

  @IsString()
  accountNumber: string;

  @IsOptional()
  @IsString()
  subAccount?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  content: string;

  @IsString()
  transferType: string;

  @IsString()
  description: string;

  @IsNumber()
  transferAmount: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsNumber()
  accumulated: number;
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