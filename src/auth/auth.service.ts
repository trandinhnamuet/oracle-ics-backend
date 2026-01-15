import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { UserSession } from './user-session.entity';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { EmailService } from '../modules/email/email.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName } = registerDto;
    this.logger.log(`Registration attempt for email: ${email}`);

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Registration failed: User already exists - ${email}`);
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    this.logger.log(`Generated OTP for ${email}: ${otp}, expires at: ${otpExpiresAt.toISOString()}`);

    // Create user with isActive = false
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      isActive: false,
      emailVerificationOtp: otp,
      otpExpiresAt,
    });

    await this.userRepository.save(user);
    this.logger.log(`User created successfully: ${email}, isActive: ${user.isActive}`);

    // Send OTP email
    try {
      await this.emailService.sendEmailVerification({
        to: email,
        userName: `${firstName} ${lastName}`,
        verificationCode: otp,
        expirationMinutes: 10,
      });
      this.logger.log(`OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      throw error;
    }

    return {
      message: 'Registration successful. Please check your email for OTP verification.',
      email: user.email,
      requiresVerification: true,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;
    this.logger.log(`OTP verification attempt for email: ${email}, otp: ${otp}`);

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`OTP verification failed: User not found - ${email}`);
      throw new BadRequestException('User not found');
    }

    this.logger.log(`User found: ${email}, isActive: ${user.isActive}, stored OTP: ${user.emailVerificationOtp}, expires: ${user.otpExpiresAt}`);

    // Check if already active
    if (user.isActive) {
      this.logger.warn(`OTP verification failed: Email already verified - ${email}`);
      throw new BadRequestException('Email already verified');
    }

    // Check OTP
    if (!user.emailVerificationOtp || user.emailVerificationOtp !== otp) {
      this.logger.warn(`OTP verification failed: Invalid OTP for ${email}. Expected: ${user.emailVerificationOtp}, Received: ${otp}`);
      throw new BadRequestException('Invalid OTP');
    }

    // Check OTP expiration
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      this.logger.warn(`OTP verification failed: OTP expired for ${email}. Expiry: ${user.otpExpiresAt}, Current: ${new Date()}`);
      throw new BadRequestException('OTP has expired');
    }

    // Activate user
    user.isActive = true;
    user.emailVerificationOtp = undefined;
    user.otpExpiresAt = undefined;
    await this.userRepository.save(user);
    this.logger.log(`User activated successfully: ${email}`);

    return {
      message: 'Email verified successfully. You can now login.',
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
      },
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { email } = resendOtpDto;
    this.logger.log(`Resend OTP request for email: ${email}`);
    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`Resend OTP failed: User not found - ${email}`);
      throw new BadRequestException('User not found');
    }

    // Check if already active
    if (user.isActive) {
      this.logger.warn(`Resend OTP failed: Email already verified - ${email}`);
      throw new BadRequestException('Email already verified');
    }

    // Generate new OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

    this.logger.log(`Generated new OTP for ${email}: ${otp}, expires at: ${otpExpiresAt.toISOString()}`);

    user.emailVerificationOtp = otp;
    user.otpExpiresAt = otpExpiresAt;
    await this.userRepository.save(user);

    // Send OTP email
    try {
      await this.emailService.sendEmailVerification({
        to: email,
        userName: `${user.firstName} ${user.lastName}`,
        verificationCode: otp,
        expirationMinutes: 10,
      });
      this.logger.log(`Resend OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to resend OTP email to ${email}:`, error);
      throw error;
    }

    return {
      message: 'OTP has been resent to your email',
      success: true,
    };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ==================== SESSION MANAGEMENT ====================

  async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(refreshToken, 12);
  }

  async validateRefreshToken(
    plainToken: string,
    hashedToken: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainToken, hashedToken);
  }

  async createSession(
    userId: string,
    refreshToken: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<UserSession> {
    const refreshTokenHash = await this.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const session = this.sessionRepository.create({
      userId,
      refreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });

    return this.sessionRepository.save(session);
  }

  async findSessionByToken(
    userId: string,
    refreshToken: string,
  ): Promise<UserSession | null> {
    const sessions = await this.sessionRepository.find({
      where: { userId },
    });

    for (const session of sessions) {
      const isValid = await this.validateRefreshToken(
        refreshToken,
        session.refreshTokenHash,
      );
      if (isValid) {
        return session;
      }
    }

    return null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepository.delete(sessionId);
  }

  async deleteAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.delete({ userId });
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.sessionRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  generateTokens(user: User): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload: JwtPayload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role || 'customer',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '10s',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, userAgent: string, ipAddress: string) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if email is verified
    if (!user.isActive) {
      throw new UnauthorizedException('Please verify your email first');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id.toString(), refreshToken, userAgent, ipAddress);

    // Return user info without sensitive data
    const { password: _pw, refreshToken: _rt, ...userWithoutSensitive } = user;
    return {
      accessToken,
      refreshToken,
      user: userWithoutSensitive,
    };
  }

  async validateUser(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async refresh(
    refreshToken: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.findSessionByToken(payload.sub, refreshToken);
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    if (new Date() > session.expiresAt) {
      await this.deleteSession(session.id);
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.userRepository.findOne({ 
      where: { id: parseInt(payload.sub) } 
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Token rotation: delete old session
    await this.deleteSession(session.id);

    // Generate new tokens
    const tokens = this.generateTokens(user);

    // Create new session
    await this.createSession(
      user.id.toString(),
      tokens.refreshToken,
      userAgent,
      ipAddress,
    );

    return tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const session = await this.findSessionByToken(userId, refreshToken);
    if (session) {
      await this.deleteSession(session.id);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.deleteAllUserSessions(userId);
  }

  /**
   * Forgot Password - Send OTP to email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if user exists or not for security
      return {
        message: 'If your email exists in our system, you will receive a password reset OTP',
        success: true,
      };
    }

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    // Save OTP to user
    user.passwordResetOtp = otp;
    user.passwordResetOtpExpiresAt = otpExpiresAt;
    await this.userRepository.save(user);

    // Send OTP email
    await this.emailService.sendPasswordReset({
      to: email,
      userName: `${user.firstName} ${user.lastName}`,
      resetCode: otp,
      expirationMinutes: 10,
    });

    return {
      message: 'Password reset OTP has been sent to your email',
      email: user.email,
      success: true,
    };
  }

  /**
   * Verify Reset OTP
   */
  async verifyResetOtp(verifyResetOtpDto: VerifyResetOtpDto) {
    const { email, otp } = verifyResetOtpDto;

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check OTP
    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Check OTP expiration
    if (!user.passwordResetOtpExpiresAt || new Date() > user.passwordResetOtpExpiresAt) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    return {
      message: 'OTP verified successfully. You can now reset your password.',
      success: true,
    };
  }

  /**
   * Reset Password - Change password with OTP
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check OTP
    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Check OTP expiration
    if (!user.passwordResetOtpExpiresAt || new Date() > user.passwordResetOtpExpiresAt) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.passwordResetOtp = undefined;
    user.passwordResetOtpExpiresAt = undefined;
    await this.userRepository.save(user);

    return {
      message: 'Password has been reset successfully. You can now login with your new password.',
      success: true,
    };
  }
}
