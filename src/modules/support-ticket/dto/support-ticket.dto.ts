import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, MinLength, MaxLength, IsUrl } from 'class-validator';
import { TicketPriority, TicketStatus } from '../../../entities/support-ticket.entity';

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
  // Enum-checked, not plain strings: a bare @IsString accepted any value and
  // stored it, after which the admin UI's STATUS_CONFIG / PRIORITY_CONFIG lookup
  // fell through and the row rendered blank (QA 2026-09-10,
  // TICKET/status-bogus + TICKET/priority-bogus).
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'status must be one of: open, in_progress, resolved, closed' })
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority, { message: 'priority must be one of: low, medium, high, urgent' })
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  admin_note?: string;
}
