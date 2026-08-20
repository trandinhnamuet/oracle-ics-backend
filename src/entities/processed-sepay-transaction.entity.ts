import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

/**
 * Idempotency ledger for Sepay bank webhooks.
 *
 * Sepay can (and does) re-deliver the same bank transaction — on retry, or as a
 * plain duplicate. Every incoming webhook is keyed by its bank transaction id
 * (`webhookData.id`); a row is inserted here BEFORE any wallet/subscription side
 * effect. The UNIQUE constraint makes the insert the single source of truth for
 * "has this transfer already been applied?", and also serialises two concurrent
 * deliveries of the same transfer (the second insert fails the unique check).
 */
@Entity('processed_sepay_transactions', { schema: 'oracle' })
export class ProcessedSepayTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_processed_sepay_bank_tx_id', { unique: true })
  @Column({ type: 'varchar', length: 100, name: 'bank_tx_id' })
  bankTxId: string;

  @Column({ type: 'uuid', nullable: true, name: 'payment_id' })
  paymentId: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'processed_at' })
  processedAt: Date;
}
