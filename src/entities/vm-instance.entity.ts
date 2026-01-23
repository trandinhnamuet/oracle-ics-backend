import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'vm_instances', schema: 'oracle' })
@Index(['user_id', 'lifecycle_state'])
@Index(['compartment_id'])
export class VmInstance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid', nullable: false })
  subscription_id: string;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  compartment_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  instance_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  instance_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shape: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  operating_system: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  availability_domain: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  public_ip: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  private_ip: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vcn_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subnet_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @Column({ type: 'text', nullable: true })
  ssh_public_key: string;

  @Column({ type: 'text', nullable: true })
  ssh_private_key_encrypted: string;

  @Column({ type: 'text', nullable: true })
  windows_initial_password: string;

  @Column({ type: 'int', nullable: true })
  system_ssh_key_id: number | null;

  @Column({ type: 'boolean', default: true, nullable: true })
  has_admin_access: boolean;

  @Column({ type: 'timestamp', nullable: true })
  vm_started_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
