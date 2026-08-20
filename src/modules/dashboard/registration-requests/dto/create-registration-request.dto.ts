import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Explicit allow-list for the PUBLIC registration form.
 *
 * The endpoint previously took `Partial<RegistrationRequests>` — the entity
 * itself — so an unauthenticated caller could set any column. Two of those were
 * dangerous:
 *
 *   * `id` — the service persists with repository.save(), and TypeORM turns a
 *     payload carrying a primary key into an UPDATE. Posting an existing id
 *     therefore overwrote that customer's registration record.
 *   * `is_served` — marking a request as already handled hides it from the
 *     back-office queue.
 *
 * Only the fields the form legitimately submits are accepted here; `id`,
 * `submitted_at` and `is_served` are owned by the server.
 */
export class CreateRegistrationRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  user_name: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone_number: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  company?: string;

  @IsString()
  @IsOptional()
  additional_notes?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  plan_name: string;

  @IsString()
  @IsOptional()
  plan_description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  plan_price?: string;
}
