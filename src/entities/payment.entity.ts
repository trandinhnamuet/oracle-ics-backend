import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('payments', { schema: 'oracle' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'uuid', nullable: true })
  subscription_id: string;

  @Column({ type: 'integer', nullable: true })
  cloud_package_id: number;

  @Column({ type: 'varchar', length: 50 })
  payment_method: string; // sepay_qr, bank_transfer, etc.

  @Column({ type: 'varchar', length: 50 })
  payment_type: string; // deposit, subscription, etc.

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string; // pending, success, failed

  @Column({ type: 'varchar', length: 255, nullable: true })
  transaction_code: string; // Unique transaction code for bank transfer

  @Column({ type: 'text', nullable: true })
  description: string;

  // @Column({ type: 'json', nullable: true })
  // metadata: any; // Store additional payment info - Tạm thời comment out do chưa có column trong DB

  // @CreateDateColumn()
  // created_at: Date;

  // @UpdateDateColumn()
  // updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}