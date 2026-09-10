import { IsEmail, IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { NormalizedEmail } from '../../common/decorators/normalized-email.decorator';

export class CreateUserDto {
  // NormalizedEmail = @IsEmail + trim/lowercase, so an admin cannot create a
  // second account that differs from an existing one only in letter case.
  @NormalizedEmail()
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  // bcrypt only hashes the first 72 bytes, so anything past that would be
  // silently ignored and two different passwords would both unlock the account
  // (QA 2026-09-11, AUTHX/bcrypt-72).
  @MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự' })
  password: string;

  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @MinLength(1, { message: 'Tên không được để trống' })
  firstName: string;

  @IsString({ message: 'Họ phải là chuỗi ký tự' })
  @MinLength(1, { message: 'Họ không được để trống' })
  lastName: string;

  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  @MaxLength(20, { message: 'Số điện thoại không được quá 20 ký tự' })
  phoneNumber?: string;

  @IsOptional()
  @IsString({ message: 'Tên công ty phải là chuỗi ký tự' })
  @MaxLength(255, { message: 'Tên công ty không được quá 255 ký tự' })
  company?: string;

  @IsOptional()
  @IsString({ message: 'Giới tính phải là chuỗi ký tự' })
  @MaxLength(10, { message: 'Giới tính không được quá 10 ký tự' })
  gender?: string;

  @IsOptional()
  @IsString({ message: 'CCCD phải là chuỗi ký tự' })
  @MaxLength(20, { message: 'CCCD không được quá 20 ký tự' })
  idCard?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email dự phòng không hợp lệ' })
  backupEmail?: string;

  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Địa chỉ không được quá 500 ký tự' })
  address?: string;

  // NOTE: no default initializers here. UpdateUserDto = PartialType(CreateUserDto),
  // and class-transformer copies these initializers onto every instance — so with
  // ValidationPipe({transform}) a PATCH /users/:id body of just {firstName} would
  // silently carry isActive=true + role='customer', un-banning users and demoting
  // admins (M10). Defaults for CREATE are applied in UserService.create instead.
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái hoạt động phải là boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsString({ message: 'Role phải là chuỗi ký tự' })
  @MaxLength(20, { message: 'Role không được quá 20 ký tự' })
  role?: string;
}
