import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users', { schema: 'oracle' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'phone_number', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ length: 255, nullable: true })
  company?: string;

  @Column({ name: 'google_id', unique: true, nullable: true })
  googleId?: string;

  @Column({ name: 'auth_provider', length: 20, default: 'local' })
  authProvider: string;

  @Column({ length: 20, default: 'customer' })
  role: string;

  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @Column({ name: 'email_verification_otp', length: 6, nullable: true })
  emailVerificationOtp?: string;

  @Column({ name: 'otp_expires_at', type: 'timestamp', nullable: true })
  otpExpiresAt?: Date;

  @Column({ name: 'password_reset_otp', length: 6, nullable: true })
  passwordResetOtp?: string;

  @Column({ name: 'password_reset_otp_expires_at', type: 'timestamp', nullable: true })
  passwordResetOtpExpiresAt?: Date;

  @Column({ name: 'refresh_token', length: 500, nullable: true })
  refreshToken?: string;

  @Column({ name: 'refresh_token_expires_at', type: 'timestamp', nullable: true })
  refreshTokenExpiresAt?: Date;

  @Column({ name: 'avatar_url', length: 500, nullable: true })
  avatarUrl?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
