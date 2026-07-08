import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity('users', { schema: 'oracle' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // @Exclude() strips this from every serialized response (the global
  // ClassSerializerInterceptor honours it), including when a User is returned
  // nested inside another entity's relation (payments, subscriptions, wallets,
  // support tickets…). Previously the bcrypt password hash leaked through those
  // endpoints (WSTG-CONF-09 — Exposure of Sensitive Data).
  //
  // select: false is defense-in-depth: the hash is no longer even loaded into
  // memory for the many queries that join a User (they never need it), so a
  // future raw query (getRawMany) or manual object spread cannot re-leak it.
  // The two flows that genuinely need it — login and change-password — opt in
  // explicitly via QueryBuilder.addSelect('user.password'). Writes are
  // unaffected: repository.save() skips undefined columns, so loaded-then-saved
  // users keep their existing hash.
  @Exclude()
  @Column({ nullable: true, select: false })
  password: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'phone_number', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ length: 255, nullable: true })
  company?: string;

  @Column({ length: 10, nullable: true })
  gender?: string;

  @Column({ name: 'id_card', length: 20, nullable: true })
  idCard?: string;

  @Column({ name: 'backup_email', length: 255, nullable: true })
  backupEmail?: string;

  @Column({ length: 500, nullable: true })
  address?: string;

  @Column({ name: 'google_id', unique: true, nullable: true })
  googleId?: string;

  @Column({ name: 'auth_provider', length: 20, default: 'local' })
  authProvider: string;

  @Column({ length: 20, default: 'customer' })
  role: string;

  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @Exclude()
  @Column({ name: 'email_verification_otp', length: 6, nullable: true })
  emailVerificationOtp?: string;

  @Exclude()
  @Column({ name: 'otp_expires_at', type: 'timestamp', nullable: true })
  otpExpiresAt?: Date;

  @Exclude()
  @Column({ name: 'password_reset_otp', length: 6, nullable: true })
  passwordResetOtp?: string;

  @Exclude()
  @Column({ name: 'password_reset_otp_expires_at', type: 'timestamp', nullable: true })
  passwordResetOtpExpiresAt?: Date;

  @Exclude()
  @Column({ name: 'refresh_token', length: 500, nullable: true })
  refreshToken?: string;

  @Exclude()
  @Column({ name: 'refresh_token_expires_at', type: 'timestamp', nullable: true })
  refreshTokenExpiresAt?: Date;

  @Column({ name: 'avatar_url', length: 500, nullable: true })
  avatarUrl?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
