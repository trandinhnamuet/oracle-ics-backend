import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('otp_rate_limit', { schema: 'oracle' })
@Index('idx_otp_rate_limit_email_sent', ['email', 'sentAt'])
export class OtpRateLimit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'timestamptz', name: 'sent_at', default: () => 'NOW()' })
  sentAt: Date;
}
