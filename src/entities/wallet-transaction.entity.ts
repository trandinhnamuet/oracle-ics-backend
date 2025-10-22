import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { UserWallet } from './user-wallet.entity';

@Entity('wallet_transactions', { schema: 'oracle' })
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  wallet_id: number;

  @Column({ type: 'uuid' })
  payment_id: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  change_amount: number;

  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  balance_after: number;

  @Column({ type: 'text', nullable: true })
  type: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => UserWallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: UserWallet;
}