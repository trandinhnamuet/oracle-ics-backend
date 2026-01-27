import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class RequestNewKeyDto {
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.email !== '' && o.email !== null && o.email !== undefined)
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;
}
