import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @Matches(PASSWORD_REGEX, { message: 'Mật khẩu mới phải có chữ thường, chữ hoa, chữ số và ký tự đặc biệt' })
  newPassword: string;
}
