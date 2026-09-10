import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

/**
 * `@IsEmail()` plus trim-and-lowercase.
 *
 * Without normalisation, `NAM@ICS.VN` and `nam@ics.vn` were two different rows:
 * the unique index on `email` is byte-exact, so a customer could register a
 * second account for the same mailbox, get a second wallet, and then fail to
 * log in with the casing they normally type (QA 2026-09-11, AUTHX/email-case-dup).
 *
 * Applied to every DTO field that identifies a user by e-mail, so registration,
 * login, OTP verification and password reset all agree on one canonical form.
 */
export function NormalizedEmail(maxLength = 255) {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)),
    IsEmail(),
    MaxLength(maxLength),
  );
}
