import { IsIn, IsString } from 'class-validator';

export type ActionOtpType = 'request-key' | 'reset-password';

export class SendActionOtpDto {
  @IsString()
  @IsIn(['request-key', 'reset-password'], {
    message: 'action must be either "request-key" or "reset-password"',
  })
  action: ActionOtpType;
}
