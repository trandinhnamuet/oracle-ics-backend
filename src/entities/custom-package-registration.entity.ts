import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('custom_package_registrations', { schema: 'oracle' })
export class CustomPackageRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 255, nullable: true })
  company?: string;

  @Column({ type: 'text', nullable: true })
  detail?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', length: 255, nullable: true })
  createdBy?: string;

  @Column({ default: false })
  processed: boolean;
}