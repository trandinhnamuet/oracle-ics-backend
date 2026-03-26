import { IsOptional, IsString, MinLength, MaxLength, registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

function IsWindowsPasswordCompliant(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWindowsPasswordCompliant',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          // Reject if contains the account name "opc" (case-insensitive)
          if (value.toLowerCase().includes('opc')) return false;
          // Require ALL 4 categories (matches OCI Windows image hardened policy)
          const hasUpper = /[A-Z]/.test(value);
          const hasLower = /[a-z]/.test(value);
          const hasDigit = /[0-9]/.test(value);
          const hasSpecial = /[^A-Za-z0-9]/.test(value);
          return hasUpper && hasLower && hasDigit && hasSpecial;
        },
        defaultMessage(args: ValidationArguments): string {
          const val = args.value as string;
          if (typeof val === 'string' && val.toLowerCase().includes('opc')) {
            return 'Password must not contain the username "opc"';
          }
          const missing: string[] = [];
          if (!/[A-Z]/.test(val)) missing.push('uppercase letter (A-Z)');
          if (!/[a-z]/.test(val)) missing.push('lowercase letter (a-z)');
          if (!/[0-9]/.test(val)) missing.push('digit (0-9)');
          if (!/[^A-Za-z0-9]/.test(val)) missing.push('special character (e.g. !@#$%)');
          return `Password is missing: ${missing.join(', ')}`;
        },
      },
    });
  };
}

export class ResetWindowsPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(127, { message: 'Password must not exceed 127 characters' })
  @IsWindowsPasswordCompliant()
  newPassword?: string;
}
