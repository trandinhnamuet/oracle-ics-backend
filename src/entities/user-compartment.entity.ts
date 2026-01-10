import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'user_compartments', schema: 'oracle' })
@Index(['user_id', 'region'])
export class UserCompartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ name: 'compartment_id', type: 'varchar', length: 255, nullable: false })
  compartment_ocid: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  compartment_name: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  region: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
