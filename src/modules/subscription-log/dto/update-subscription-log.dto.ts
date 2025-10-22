import { PartialType } from '@nestjs/mapped-types';
import { CreateSubscriptionLogDto } from './create-subscription-log.dto';

export class UpdateSubscriptionLogDto extends PartialType(CreateSubscriptionLogDto) {}