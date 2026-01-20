import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsEmail } from 'class-validator';

export class ConfigureVmDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsNotEmpty()
  imageId: string;

  @IsString()
  @IsNotEmpty()
  shape: string;

  @IsNumber()
  @Min(1)
  @Max(64)
  @IsOptional()
  ocpus?: number;

  @IsNumber()
  @Min(1)
  @Max(1024)
  @IsOptional()
  memoryInGBs?: number;

  @IsNumber()
  @Min(50)
  @Max(32768)
  @IsOptional()
  bootVolumeSizeInGBs?: number;

  @IsEmail()
  @IsOptional()
  notificationEmail?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
