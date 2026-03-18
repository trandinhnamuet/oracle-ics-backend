import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface TermsArticle {
  number: string;
  heading: string;
  paragraphs: string[];
}

@Entity('terms_sections', { schema: 'oracle' })
export class TermsSection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'title_vi', length: 500 })
  titleVi: string;

  @Column({ name: 'title_en', length: 500 })
  titleEn: string;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @Column({ name: 'articles_vi', type: 'jsonb', default: () => "'[]'::jsonb" })
  articlesVi: TermsArticle[];

  @Column({ name: 'articles_en', type: 'jsonb', default: () => "'[]'::jsonb" })
  articlesEn: TermsArticle[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
