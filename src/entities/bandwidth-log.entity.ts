import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * BandwidthSnapshot — stores monthly bandwidth totals per VM.
 * One record per VM per month.
 * Acts as an archive once OCI Monitoring metrics expire after 90 days.
 */
@Entity({ name: 'bandwidth_monthly_snapshots', schema: 'oracle' })
@Index(['instance_id', 'year_month'], { unique: true })
@Index(['user_id', 'year_month'])
export class BandwidthSnapshot {
  @PrimaryGeneratedColumn('increment')
  id: number;

  /** Nullable — may be null if VM record was removed from DB */
  @Column({ type: 'integer', nullable: true })
  vm_instance_id: number | null;

  /** OCI Instance OCID */
  @Column({ type: 'varchar', length: 500 })
  instance_id: string;

  @Column({ type: 'varchar', length: 255 })
  instance_name: string;

  /** OCI Compartment OCID — kept even after vm_instances record is deleted */
  @Column({ type: 'varchar', length: 500, nullable: true })
  compartment_id: string | null;

  @Column({ type: 'integer' })
  user_id: number;

  @Column({ type: 'uuid', nullable: true })
  subscription_id: string | null;

  /** Format: "YYYY-MM" e.g. "2026-03" */
  @Column({ type: 'char', length: 7 })
  year_month: string;

  /** Total egress bytes (VnicBytesOut) — what OCI charges for */
  @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
  bytes_out_total: number;

  /** Total ingress bytes (VnicBytesIn) — informational, not billed */
  @Column({ type: 'numeric', precision: 20, scale: 0, default: 0 })
  bytes_in_total: number;

  /** 'oci' = queried from OCI Monitoring API */
  @Column({ type: 'varchar', length: 20, default: 'oci' })
  data_source: string;

  @CreateDateColumn()
  recorded_at: Date;
}
