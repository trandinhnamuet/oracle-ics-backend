import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('system_ssh_keys', { schema: 'oracle' })
export class SystemSshKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  key_name: string;

  @Column({ type: 'varchar', length: 20, default: 'admin' })
  key_type: string; // admin, backup, emergency

  @Column({ type: 'text' })
  public_key: string;

  @Column({ type: 'text' })
  private_key_encrypted: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fingerprint: string;

  @Column({ type: 'varchar', length: 20, default: 'RSA' })
  algorithm: string;

  @Column({ type: 'integer', default: 4096 })
  key_size: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at: Date;

  @Column({ type: 'integer', default: 0 })
  usage_count: number;
}
