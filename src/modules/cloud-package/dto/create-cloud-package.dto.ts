import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateCloudPackageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  cost: number;

  @IsNumber()
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