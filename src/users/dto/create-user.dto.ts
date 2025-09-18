import { IsEmail, IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
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
  @IsBoolean({ message: 'Trạng thái hoạt động phải là boolean' })
  isActive?: boolean = true;
}
