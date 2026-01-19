import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('admin_login_history', { schema: 'oracle' })
@Index('IDX_admin_login_history_admin_id', ['adminId'])
@Index('IDX_admin_login_history_login_time', ['loginTime'])
@Index('IDX_admin_login_history_status', ['loginStatus'])
export class AdminLoginHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'admin_id', type: 'int', nullable: false })
  adminId: number;

  @Column({ name: 'username', type: 'varchar', length: 255 })
  username: string;

  @Column({ name: 'role', type: 'varchar', length: 50, default: 'admin' })
  role: string;

  @Column({ name: 'login_time', type: 'timestamp' })
  loginTime: Date;

  @Column({ name: 'login_status', type: 'varchar', length: 50 })
  loginStatus: 'success' | 'failed' | 'locked';

  @Column({ name: 'ip_v4', type: 'varchar', length: 45, nullable: true })
  ipV4?: string;

  @Column({ name: 'ip_v6', type: 'varchar', length: 45, nullable: true })
  ipV6?: string;

  @Column({ name: 'country', type: 'varchar', length: 100, nullable: true })
  country?: string;

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city?: string;

  @Column({ name: 'isp', type: 'varchar', length: 100, nullable: true })
  isp?: string;

  @Column({ name: 'browser', type: 'varchar', length: 100, nullable: true })
  browser?: string;

  @Column({ name: 'os', type: 'varchar', length: 100, nullable: true })
  os?: string;

  @Column({ name: 'device_type', type: 'varchar', length: 50, nullable: true })
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: '2fa_status', type: 'varchar', length: 50, nullable: true })
  twoFaStatus?: 'pending' | 'passed' | 'failed' | 'not_enabled';

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId?: string;

  @Column({ name: 'is_new_device', type: 'boolean', default: false })
  isNewDevice: boolean;

  @Column({ name: 'logout_time', type: 'timestamp', nullable: true })
  logoutTime?: Date;

  @Column({ name: 'session_duration_minutes', type: 'int', nullable: true })
  sessionDurationMinutes?: number;

  @Column({ name: 'failed_attempts_before_success', type: 'int', default: 0 })
  failedAttemptsBeforeSuccess: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin?: User;
}
