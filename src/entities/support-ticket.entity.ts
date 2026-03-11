import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('support_tickets', { schema: 'oracle' })
export class SupportTicket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 150 })
  customer_name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  service: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  attachment_url: string;

  @Column({ type: 'text', nullable: true })
  attachments: string; // JSON: Array<{ url: string; name: string; mimeType: string; size: number }>

  @Column({
    type: 'varchar',
    length: 20,
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  @Column({ type: 'text', nullable: true })
  admin_note: string;

  @Column({ type: 'integer', nullable: true })
  resolved_by: number | null;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
