import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, MinLength, MaxLength, IsUrl } from 'class-validator';
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
  @MaxLength(10000) // F3: bound content (was unbounded — only the 10MB body cap limited it)
  content: string;

  // F3: validate the URL so a `javascript:`/arbitrary URL can't be stored and later
  // rendered/linked in the admin ticket UI (stored-XSS / open-redirect feeder).
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  attachment_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
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
