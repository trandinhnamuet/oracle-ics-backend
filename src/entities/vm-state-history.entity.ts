import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * One row per distinct lifecycle_state transition of a VM, written by the
 * `trg_vm_instances_track_state` trigger (migration 20260911100001).
 *
 * Used to reconstruct RUNNING vs STOPPED hours per calendar month: Oracle bills
 * OCPU / memory / Windows license only while an instance is running, but keeps
 * billing the boot volume until termination. Rows with source='backfill' were
 * seeded from vm_actions_log for VMs that existed before the trigger.
 */
@Entity({ name: 'vm_state_history', schema: 'oracle' })
@Index(['vm_instance_id', 'changed_at'])
export class VmStateHistory {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  vm_instance_id: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  old_state: string | null;

  @Column({ type: 'varchar', length: 50 })
  new_state: string;

  @Column({ type: 'timestamp' })
  changed_at: Date;

  @Column({ type: 'varchar', length: 20, default: 'trigger' })
  source: string;
}
