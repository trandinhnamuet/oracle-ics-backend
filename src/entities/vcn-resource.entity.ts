import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'vcn_resources', schema: 'oracle' })
@Index(['user_id', 'compartment_id'])
export class VcnResource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  compartment_id: string;

  @Column({ name: 'vcn_id', type: 'varchar', length: 255, nullable: false })
  vcn_ocid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vcn_name: string;

  @Column({ name: 'cidr_block', type: 'varchar', length: 50, nullable: true })
  vcn_cidr_block: string;

  @Column({ name: 'subnet_id', type: 'varchar', length: 255, nullable: true })
  subnet_ocid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subnet_name: string;

  @Column({ name: 'internet_gateway_id', type: 'varchar', length: 255, nullable: true })
  internet_gateway_ocid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  route_table_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  security_list_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
