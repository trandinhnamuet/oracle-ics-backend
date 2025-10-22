import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Subscription } from './subscription.entity';

@Entity('subscription_logs', { schema: 'oracle' })
export class SubscriptionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  subscription_id: string;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'varchar', length: 100 })
  action: string; // start_vm, pause_vm, restart_vm, create_backup, delete_vm, change_password, change_configuration, auto_renew, cancel

  @Column({ type: 'varchar', length: 50, nullable: true })
  status_old: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status_new: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata: any; // Store additional action data

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Subscription)
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;
}