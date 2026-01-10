import { IsEmail, IsOptional } from 'class-validator';

export class RequestNewKeyDto {
  @IsEmail()
  @IsOptional()
  email?: string;
}
