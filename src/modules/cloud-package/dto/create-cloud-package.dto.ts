import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

// Lengths mirror the cloud_packages column widths (name/type varchar(20), the
// rest varchar(50)). Without them an over-long value reached Postgres and came
// back as a 500 "value too long for type character varying(20)"
// (QA 2026-09-10, PKG/create-long).

export class CreateCloudPackageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
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
  @MaxLength(50)
  cpu?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  ram?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  memory?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  feature?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  bandwidth?: string;

  @IsNumber()
  @IsOptional()
  updated_by?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}