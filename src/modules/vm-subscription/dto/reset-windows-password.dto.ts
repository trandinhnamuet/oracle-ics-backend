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
          const categories = [
            /[A-Z]/.test(value),
            /[a-z]/.test(value),
            /[0-9]/.test(value),
            /[^A-Za-z0-9]/.test(value),
          ];
          const metCount = categories.filter(Boolean).length;
          // Reject if contains the account name "opc" (case-insensitive)
          if (value.toLowerCase().includes('opc')) return false;
          return metCount >= 3;
        },
        defaultMessage(args: ValidationArguments): string {
          const val = args.value as string;
          if (typeof val === 'string' && val.toLowerCase().includes('opc')) {
            return 'Password must not contain the username "opc"';
          }
          return (
            'Password must contain characters from at least 3 of the following 4 categories: ' +
            'uppercase letters (A-Z), lowercase letters (a-z), digits (0-9), ' +
            'special characters (e.g. !@#$%^&*)'
          );
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
