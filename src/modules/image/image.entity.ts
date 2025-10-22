import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';

@Entity('images', { schema: 'oracle' })
export class Image {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  filename: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ length: 500 })
  path: string;

  @Column({ length: 500 })
  url: string;

  @Column({ name: 'uploaded_by', nullable: true })
  uploadedBy: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
