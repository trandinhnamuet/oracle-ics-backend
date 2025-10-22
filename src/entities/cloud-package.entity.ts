import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cloud_packages', { schema: 'oracle' })
export class CloudPackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  type: string;

  @Column({ type: 'numeric', precision: 15, scale: 6 })
  cost: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  cost_vnd: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cpu: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ram: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  memory: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  feature: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bandwidth: string;

  @Column({ type: 'timestamp', default: () => 'NOW()', nullable: true })
  updated_at: Date;

  @Column({ type: 'int', nullable: true })
  updated_by: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}