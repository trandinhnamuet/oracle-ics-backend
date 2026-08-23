import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Explicit allow-list for the ADMIN update route (PATCH :id).
 *
 * The endpoint previously took `Partial<RegistrationRequests>` — the entity
 * itself — which erases to `Object` at runtime, so the global ValidationPipe
 * could not whitelist it and arbitrary props (including server-owned columns
 * such as `id` and `submitted_at`) reached repository.update().
 *
 * Only the fields an admin may legitimately change are accepted here. Every
 * field is optional (partial update). `id` and `submitted_at` are owned by the
 * server and are intentionally excluded; whitelist + forbidNonWhitelisted on the
 * global pipe now strips/rejects anything not listed below.
 */
export class UpdateRegistrationRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  user_name?: string;

  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @IsOptional()
  phone_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  company?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  additional_notes?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  plan_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  plan_description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  plan_price?: string;

  @IsBoolean()
  @IsOptional()
  is_served?: boolean;
}
