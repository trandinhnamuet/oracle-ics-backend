import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'compartment_accounts', schema: 'oracle' })
@Index(['user_compartment_id'])
@Index(['user_id'])
export class CompartmentAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  user_compartment_id: number;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  oci_user_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  oci_user_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oci_user_email: string;

  @Column({ type: 'text', nullable: true })
  oci_user_description: string;

  @Column({ type: 'varchar', length: 50, nullable: false, default: 'read_only' })
  account_type: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  api_key_fingerprint: string;

  @Column({ type: 'boolean', nullable: true, default: true })
  can_use_console: boolean;

  @Column({ type: 'boolean', nullable: true, default: false })
  can_use_api: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
