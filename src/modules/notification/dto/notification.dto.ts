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

  @IsOptional()
  @IsString()
  title_en?: string;

  @IsOptional()
  @IsString()
  message_en?: string;
}

export class QueryNotificationsDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
