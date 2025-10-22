import { PartialType } from '@nestjs/mapped-types';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { IsString, IsOptional, IsDate } from 'class-validator';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {
  @IsString()
  @IsOptional()
  status?: string;

  @IsDate()
  @IsOptional()
  end_date?: Date;
}