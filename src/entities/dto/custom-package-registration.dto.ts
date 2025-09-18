import { IsEmail, IsNotEmpty, IsOptional, IsString, IsNumber, Length } from 'class-validator';

export class CreateCustomPackageRegistrationDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsNotEmpty()
  @IsString()
  @Length(10, 20)
  phoneNumber: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}