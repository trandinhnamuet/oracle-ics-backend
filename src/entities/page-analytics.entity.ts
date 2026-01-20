import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

@Entity('page_analytics')
@Index(['event_type', 'created_at'])
@Index(['page_path', 'created_at'])
@Index(['user_id', 'created_at'])
export class PageAnalyticsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', nullable: true })
  user_id?: string

  @Column({ type: 'varchar' })
  event_type: string

  @Column({ type: 'varchar', nullable: true })
  page_path?: string

  @Column({ type: 'varchar', nullable: true })
  page_title?: string

  @Column({ type: 'varchar', nullable: true })
  page_location?: string

  @Column({ type: 'text', nullable: true })
  user_agent?: string

  @Column({ type: 'varchar', nullable: true })
  button_name?: string

  @Column({ type: 'varchar', nullable: true })
  button_label?: string

  @Column({ type: 'varchar', nullable: true })
  form_name?: string

  @Column({ type: 'integer', nullable: true })
  load_time_ms?: number

  @Column({ type: 'integer', nullable: true })
  scroll_percent?: number

  @Column({ type: 'jsonb', nullable: true })
  additional_params?: Record<string, any>

  @Column({ type: 'varchar', nullable: true })
  session_id?: string

  @Column({ type: 'varchar', nullable: true })
  country?: string

  @Column({ type: 'varchar', nullable: true })
  city?: string

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date

  @Column({
    type: 'timestamp with time zone',
    nullable: true,
  })
  updated_at?: Date
}
