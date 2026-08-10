import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'vm_instances', schema: 'oracle' })
@Index(['user_id', 'lifecycle_state'])
@Index(['compartment_id'])
export class VmInstance {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid', nullable: false })
  subscription_id: string;

  @Column({ type: 'int', nullable: false })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  compartment_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  instance_id: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  instance_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shape: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  operating_system: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  operating_system_version: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  availability_domain: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  public_ip: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  private_ip: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vcn_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subnet_id: string;

  /** Primary VNIC OCID — cached for OCI Monitoring (oci_vcn) bandwidth queries */
  @Column({ type: 'varchar', length: 500, nullable: true })
  vnic_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lifecycle_state: string;

  @Column({ type: 'text', nullable: true })
  ssh_public_key: string;

  @Column({ type: 'text', nullable: true })
  ssh_private_key_encrypted: string;

  /**
   * Initial Windows password, encrypted at rest (see utils/vm-secret.util.ts).
   * Cleared once the owner has revealed it, so it cannot be retrieved again.
   */
  @Column({ type: 'text', nullable: true })
  windows_initial_password: string;

  /** When the owner performed the one-time reveal of the initial password. */
  @Column({ type: 'timestamptz', nullable: true })
  windows_initial_password_revealed_at: Date | null;

  /**
   * Last successfully-set password, encrypted at rest. Retained (not hashed)
   * because WinRM authentication needs the real value to perform the next reset.
   *
   * DOCUMENTED RISK ACCEPTANCE (security review 2026/08, item 1).
   * The reviewer asked that no VM password be stored in a directly decryptable
   * form. That is achievable for `windows_initial_password` — it is erased after
   * the owner's one-time reveal — but NOT for this column: resetting a Windows
   * guest requires presenting the current credential to WinRM, so a one-way hash
   * would make the reset feature impossible. Retention is therefore accepted,
   * with these compensating controls:
   *   - AES-256-GCM encryption at rest (utils/vm-secret.util.ts); a database
   *     dump alone does not disclose it.
   *   - The key lives in SSH_KEY_ENCRYPTION_SECRET, held in the environment and
   *     outside the database.
   *   - The value is never returned by any API, never rendered in the
   *     back-office, and is scrubbed from WinRM/SSH logs (utils/winrm-log.util.ts).
   *   - It is read only by the server-side password-reset path.
   * Revisit if OCI exposes a credential-free password-reset primitive.
   */
  @Column({ type: 'text', nullable: true })
  windows_current_password: string;

  /**
   * Tracks whether the Windows VM password has ever been reset via our API.
   * false = initial password may still be active ("must change at next logon" flag may be set).
   * true  = at least one successful API reset has been done; WinRM NTLM auth should work.
   */
  @Column({ type: 'boolean', default: false, nullable: true })
  windows_password_initialized: boolean;

  @Column({ type: 'int', nullable: true })
  system_ssh_key_id: number | null;

  @Column({ type: 'boolean', default: true, nullable: true })
  has_admin_access: boolean;

  @Column({ type: 'timestamp', nullable: true })
  vm_started_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
