import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateVmDto {
  @IsString()
  @IsNotEmpty()
  displayName: string;

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

  @IsString()
  @IsNotEmpty()
  userSshPublicKey: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  subscriptionId?: string;
}
