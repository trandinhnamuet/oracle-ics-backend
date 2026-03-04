import { IsEnum, IsNumber, IsString, IsOptional, IsObject } from 'class-validator';
import { NotificationType } from '../../../entities/notification.entity';

export class CreateNotificationDto {
  @IsNumber()
  user_id: number;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

export class QueryNotificationsDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
