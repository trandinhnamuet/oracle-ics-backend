import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { CloudPackage } from './cloud-package.entity';

@Entity('subscriptions', { schema: 'oracle' })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'integer' })
  cloud_package_id: number;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string; // active, expired, cancelled, suspended

  @Column({ type: 'boolean', default: false })
  auto_renew: boolean;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount_paid: number;

  @Column({ type: 'integer', default: 1 })
  months_paid: number;

  @Column({ type: 'json', nullable: true })
  configuration: any; // Store VM configuration

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CloudPackage)
  @JoinColumn({ name: 'cloud_package_id' })
  cloudPackage: CloudPackage;
}