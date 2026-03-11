import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { TicketPriority } from '../../../entities/support-ticket.entity';

export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  customer_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  content: string;

  @IsOptional()
  @IsString()
  attachment_url?: string;

  @IsOptional()
  @IsString()
  attachments?: string; // JSON string: Array<{ url, name, mimeType, size }>

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  admin_note?: string;
}
