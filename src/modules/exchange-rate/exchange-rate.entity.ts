import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('exchange_rate', { schema: 'oracle' })
export class ExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  currency_from: string;

  @Column({ type: 'varchar', length: 10 })
  currency_to: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 10 })
  direction: string;

  @Column({ type: 'float' })
  rate: number;
}
