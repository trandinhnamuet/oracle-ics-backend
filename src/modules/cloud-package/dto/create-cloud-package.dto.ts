import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class CreateCloudPackageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  // Prices must never be negative. A negative price let a purchase CREDIT the
  // buyer's balance instead of debiting it (WSTG-BUSL-01 — Business Logic Data
  // Validation).
  @IsNumber()
  @Min(0)
  cost: number;

  @IsNumber()
  @Min(0)
  cost_vnd: number;

  @IsString()
  @IsOptional()
  cpu?: string;

  @IsString()
  @IsOptional()
  ram?: string;

  @IsString()
  @IsOptional()
  memory?: string;

  @IsString()
  @IsOptional()
  feature?: string;

  @IsString()
  @IsOptional()
  bandwidth?: string;

  @IsNumber()
  @IsOptional()
  updated_by?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}