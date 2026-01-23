import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'bandwidth_logs', schema: 'oracle' })
@Index(['vm_instance_id', 'recorded_at'])
@Index(['user_id', 'recorded_at'])
@Index(['recorded_at'])
export class BandwidthLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'integer' })
  vm_instance_id: number;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'uuid', nullable: true })
  subscription_id: string;

  @Column({ type: 'varchar', length: 255 })
  instance_id: string;

  @Column({ type: 'varchar', length: 255 })
  instance_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
  bytes_in: number;

  @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
  bytes_out: number;

  @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
  total_bytes: number;

  @Column({ type: 'timestamp' })
  recorded_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
