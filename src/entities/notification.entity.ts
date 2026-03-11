import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  WALLET_CREDIT = 'wallet_credit',
  WALLET_DEBIT = 'wallet_debit',
  SUPPORT_TICKET_CREATED = 'support_ticket_created',
  SUPPORT_TICKET_UPDATED = 'support_ticket_updated',
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  VM_PROVISIONED = 'vm_provisioned',
  VM_STARTED = 'vm_started',
  VM_STOPPED = 'vm_stopped',
  VM_RESTARTED = 'vm_restarted',
  VM_TERMINATED = 'vm_terminated',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET = 'password_reset',
  ACCOUNT_LOGIN = 'account_login',
  GENERAL = 'general',
}

@Entity('notifications', { schema: 'oracle' })
@Index('idx_notifications_user_id', ['user_id'])
@Index('idx_notifications_is_read', ['is_read'])
@Index('idx_notifications_created_at', ['created_at'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title_en: string | null;

  @Column({ type: 'text', nullable: true })
  message_en: string | null;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any> | null;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
