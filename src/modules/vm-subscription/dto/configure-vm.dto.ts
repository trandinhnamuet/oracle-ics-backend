import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsEmail, Matches } from 'class-validator';

export class ConfigureVmDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  // Anchored OCID pattern: rejects embedded CR/LF (log forging) and any non-OCID value.
  @IsString()
  @IsNotEmpty()
  @Matches(/^ocid1\.[a-zA-Z0-9._-]+$/, { message: 'imageId must be a valid OCID' })
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
