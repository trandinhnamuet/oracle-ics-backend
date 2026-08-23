import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Length } from 'class-validator';

/**
 * Explicit allow-list for the ADMIN update route (PATCH :id).
 *
 * The endpoint previously took
 * `Partial<CreateCustomPackageRegistrationDto> & { processed?: boolean }`, which
 * erases to `Object` at runtime, so the global ValidationPipe could not
 * whitelist it and arbitrary props (including server-owned columns such as `id`
 * and `created_at`) reached repository.update().
 *
 * Only the fields an admin may legitimately change are accepted here. Every
 * field is optional (partial update). `id` and `createdAt` are owned by the
 * server and are intentionally excluded; whitelist + forbidNonWhitelisted on the
 * global pipe now strips/rejects anything not listed below.
 */
export class UpdateCustomPackageRegistrationDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  @Length(10, 20)
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsBoolean()
  processed?: boolean;
}
