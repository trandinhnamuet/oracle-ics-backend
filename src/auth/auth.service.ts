import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UAParser } from 'ua-parser-js';
import { User } from '../entities/user.entity';
import { UserSession } from './user-session.entity';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { EmailService } from '../modules/email/email.service';
import { AdminLoginHistoryService } from './admin-login-history.service';
import { CreateAdminLoginHistoryDto } from './dto/admin-login-history.dto';
import { GeolocationUtil } from '../utils/geolocation.util';

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
    private adminLoginHistoryService: AdminLoginHistoryService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName } = registerDto;
    this.logger.log(`Registration attempt for email: ${email}`);

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Registration failed: User already exists - ${email}`);
      throw new ConflictException('Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập.');
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
    const { email, otp, ipv4: ipv4Raw, ipv6: ipv6Raw } = verifyOtpDto;
    const ipv4 = ipv4Raw || null;
    const ipv6 = ipv6Raw || null;
    this.logger.log(`OTP verification attempt for email: ${email}, otp: ${otp}, ipv4: ${ipv4}, ipv6: ${ipv6}`);

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`OTP verification failed: User not found - ${email}`);
      throw new BadRequestException('Không tìm thấy tài khoản với email này.');
    }

    this.logger.log(`User found: ${email}, isActive: ${user.isActive}, stored OTP: ${user.emailVerificationOtp}, expires: ${user.otpExpiresAt}`);

    // Check if already active
    if (user.isActive) {
      this.logger.warn(`OTP verification failed: Email already verified - ${email}`);
      throw new BadRequestException('Email đã được xác thực. Bạn có thể đăng nhập ngay.');
    }

    // Check OTP
    if (!user.emailVerificationOtp || user.emailVerificationOtp !== otp) {
      this.logger.warn(`OTP verification failed: Invalid OTP for ${email}. Expected: ${user.emailVerificationOtp}, Received: ${otp}`);
      throw new BadRequestException('Mã OTP không đúng. Vui lòng kiểm tra lại.');
    }

    // Check OTP expiration
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      this.logger.warn(`OTP verification failed: OTP expired for ${email}. Expiry: ${user.otpExpiresAt}, Current: ${new Date()}`);
      throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.');
    }

    // Activate user
    user.isActive = true;
    user.emailVerificationOtp = undefined;
    user.otpExpiresAt = undefined;
    await this.userRepository.save(user);
    this.logger.log(`User activated successfully: ${email}`);

    // Record OTP verification in login history (for admin users only)
    if (user.role === 'admin') {
      try {
        const geo = GeolocationUtil.getLocationFromIP(ipv4 || ipv6);
        await this.adminLoginHistoryService.recordLogin({
          adminId: user.id,
          username: user.email,
          role: user.role,
          loginTime: new Date(),
          loginStatus: 'success',
          ipV4: ipv4,
          ipV6: ipv6,
          country: geo.country,
          city: geo.city,
          isp: null,
          browser: 'Unknown',
          os: 'Unknown',
          deviceType: 'unknown',
          userAgent: null,
          twoFaStatus: 'not_enabled',
          sessionId: this.generateSessionId(),
          isNewDevice: false,
          failedAttemptsBeforeSuccess: 0,
        });
        this.logger.log(`Recorded OTP verification for admin ${email}: IP ${ipv4 || ipv6}`);
      } catch (error) {
        this.logger.error('Failed to record OTP verification in login history', error);
        // Don't throw error - verification should succeed even if history recording fails
      }
    }

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
      throw new BadRequestException('Không tìm thấy tài khoản với email này.');
    }

    // Check if already active
    if (user.isActive) {
      this.logger.warn(`Resend OTP failed: Email already verified - ${email}`);
      throw new BadRequestException('Email đã được xác thực. Bạn có thể đăng nhập ngay.');
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

  // ==================== CLIENT INFO EXTRACTION ====================

  private parseUserAgent(userAgentString: string): {
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  } {
    try {
      const parser = new UAParser(userAgentString);
      const result = parser.getResult();

      const browser = `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim();
      const os = `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim();
      
      let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';
      if (result.device.type === 'mobile') deviceType = 'mobile';
      else if (result.device.type === 'tablet') deviceType = 'tablet';
      else if (!result.device.type) deviceType = 'desktop';

      return { browser, os, deviceType };
    } catch (error) {
      this.logger.error('Error parsing user agent', error);
      return {
        browser: 'Unknown',
        os: 'Unknown',
        deviceType: 'unknown',
      };
    }
  }

  private extractIpAddress(request: any): { ipV4: string | null; ipV6: string | null } {
    let ipV4: string | null = null;
    let ipV6: string | null = null;
    let ip: string | null = null;

    // 1. Try x-forwarded-for header (nginx, apache, common proxy, load balancer)
    // This is the most important header when behind a proxy/load balancer
    if (!ip) {
      const xForwardedFor = request.headers?.['x-forwarded-for'];
      if (typeof xForwardedFor === 'string') {
        const ips = xForwardedFor.split(',').map((i: string) => i.trim());
        // Take the first IP (client's real IP, not proxy IP)
        ip = ips[0];
        this.logger.debug(`Found IP from x-forwarded-for: ${ip}`);
      }
    }

    // 2. Try x-real-ip header (nginx)
    if (!ip) {
      ip = request.headers?.['x-real-ip'];
      if (ip) {
        this.logger.debug(`Found IP from x-real-ip: ${ip}`);
      }
    }

    // 3. Try cf-connecting-ip header (Cloudflare)
    if (!ip) {
      ip = request.headers?.['cf-connecting-ip'];
      if (ip) {
        this.logger.debug(`Found IP from cf-connecting-ip: ${ip}`);
      }
    }

    // 4. Try x-client-ip header (some proxies)
    if (!ip) {
      ip = request.headers?.['x-client-ip'];
      if (ip) {
        this.logger.debug(`Found IP from x-client-ip: ${ip}`);
      }
    }

    // 5. Fallback to connection.remoteAddress or socket.remoteAddress
    if (!ip) {
      ip = request.connection?.remoteAddress || request.socket?.remoteAddress || request.ip;
      if (ip) {
        this.logger.debug(`Found IP from socket: ${ip}`);
      }
    }

    // Parse IPv4 vs IPv6
    if (ip) {
      // Clean up the IP
      ip = ip.trim();
      
      // Check if it's IPv4 (contains dots and no colons)
      if (ip.includes('.') && !ip.includes(':')) {
        ipV4 = ip;
      } 
      // Check if it's IPv6 or IPv4-mapped IPv6 (contains colons)
      else if (ip.includes(':')) {
        // IPv4-mapped IPv6 like ::ffff:192.0.2.1
        if (ip.includes('::ffff:')) {
          ipV4 = ip.split('::ffff:')[1];
        } 
        // Localhost IPv6
        else if (ip === '::1' || ip === 'localhost') {
          ipV4 = '127.0.0.1';
        } 
        // Pure IPv6
        else {
          ipV6 = ip;
        }
      }
    }

    this.logger.log(
      `Extracted IP - IPv4: ${ipV4 || 'null'}, IPv6: ${ipV6 || 'null'} (raw: ${ip || 'null'})`
    );

    return { ipV4, ipV6 };
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      expiresIn: '30m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, userAgent: string, request: any) {
    const { email, password, ipv4: ipv4Raw, ipv6: ipv6Raw } = loginDto;
    const ipv4Frontend = ipv4Raw || null;
    const ipv6Frontend = ipv6Raw || null;

    // Use IP from frontend (ipify.org - public IP) if provided, otherwise extract from request headers
    let ipV4: string | null = ipv4Frontend;
    let ipV6: string | null = ipv6Frontend;
    
    if (!ipV4 && !ipV6) {
      // Fallback to extracting from request headers
      const extracted = this.extractIpAddress(request);
      ipV4 = extracted.ipV4;
      ipV6 = extracted.ipV6;
    }

    this.logger.debug(`Login attempt - Email: ${email}, IPv4: ${ipV4}, IPv6: ${ipV6}, Source: ${ipv4Frontend ? 'frontend' : 'headers'}`);

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    
    // Record failed login attempt if user not found
    if (!user) {
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = GeolocationUtil.getLocationFromIP(ipV4 || ipV6);
        
        await this.adminLoginHistoryService.recordLogin({
          adminId: null,
          username: email,
          role: 'unknown',
          loginTime: new Date(),
          loginStatus: 'failed',
          ipV4,
          ipV6,
          country: geo.country,
          city: geo.city,
          isp: null,
          browser,
          os,
          deviceType,
          userAgent,
          twoFaStatus: 'not_enabled',
          sessionId: this.generateSessionId(),
          isNewDevice: false,
          failedAttemptsBeforeSuccess: 1,
        });
      } catch (error) {
        this.logger.error('Failed to record login attempt for non-existent user', error);
      }

      // Don't reveal that email doesn't exist (security)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại thông tin đăng nhập.');
    }

    // Check password first (before checking email verification)
    // This ensures we don't leak information about unverified accounts
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Record failed login
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = GeolocationUtil.getLocationFromIP(ipV4 || ipV6);
        
        await this.adminLoginHistoryService.recordLogin({
          adminId: user.role === 'admin' ? user.id : null,
          username: user.email,
          role: user.role || 'customer',
          loginTime: new Date(),
          loginStatus: 'failed',
          ipV4,
          ipV6,
          country: geo.country,
          city: geo.city,
          isp: null,
          browser,
          os,
          deviceType,
          userAgent,
          twoFaStatus: 'not_enabled',
          sessionId: this.generateSessionId(),
          isNewDevice: false,
          failedAttemptsBeforeSuccess: 1,
        });
      } catch (error) {
        this.logger.error('Failed to record failed login attempt', error);
      }

      // Don't reveal that email exists (security)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại thông tin đăng nhập.');
    }

    // Check if email is verified - if not, generate and send new OTP
    if (!user.isActive) {
      this.logger.log(`Login attempt with unverified account: ${email}`);
      
      // Generate new OTP
      const otp = this.generateOtp();
      const otpExpiresAt = new Date();
      otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

      this.logger.log(`Generated new OTP for unverified login: ${email}: ${otp}, expires at: ${otpExpiresAt.toISOString()}`);

      // Update user with new OTP
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
        this.logger.log(`OTP email sent to unverified account: ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send OTP email to ${email}:`, error);
        // Continue anyway - user can request resend
      }

      // Return response indicating verification is required
      return {
        requiresVerification: true,
        email: user.email,
        message: `Tài khoản này chưa xác thực. OTP đã được gửi về email ${user.email}. Vui lòng nhập OTP để xác thực tài khoản.`,
      };
    }

    // Generate session ID
    const sessionId = this.generateSessionId();

    // Generate JWT tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id.toString(), refreshToken, userAgent, ipV4 || ipV6 || '');

    // Record successful login (only for admin users)
    if (user.role === 'admin') {
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = GeolocationUtil.getLocationFromIP(ipV4 || ipV6);
        const isNewDevice = await this.adminLoginHistoryService.isNewDevice(user.id, ipV4 || ipV6 || '');

        await this.adminLoginHistoryService.recordLogin({
          adminId: user.id,
          username: user.email,
          role: user.role,
          loginTime: new Date(),
          loginStatus: 'success',
          ipV4,
          ipV6,
          country: geo.country,
          city: geo.city,
          isp: null,
          browser,
          os,
          deviceType,
          userAgent,
          twoFaStatus: 'not_enabled',
          sessionId,
          isNewDevice,
          failedAttemptsBeforeSuccess: 0,
        });
      } catch (error) {
        this.logger.error('Failed to record successful login', error);
        // Don't throw error - login should succeed even if history recording fails
      }
    }

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
      throw new UnauthorizedException('Không tìm thấy tài khoản.');
    }
    return user;
  }

  async refresh(
    refreshToken: string,
    userAgent: string,
    request: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Extract real IP from request
    const { ipV4, ipV6 } = this.extractIpAddress(request);
    const ipAddress = ipV4 || ipV6 || '';
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    }

    const session = await this.findSessionByToken(payload.sub, refreshToken);
    if (!session) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
    }

    if (new Date() > session.expiresAt) {
      await this.deleteSession(session.id);
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }

    const user = await this.userRepository.findOne({ 
      where: { id: parseInt(payload.sub) } 
    });
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản.');
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

      // Record logout in login history (for admin users)
      try {
        const user = await this.userRepository.findOne({ where: { id: parseInt(userId) } });
        if (user && user.role === 'admin') {
          // Find the most recent login session
          const recentLogin = await this.adminLoginHistoryService.getRecentLogins(parseInt(userId), 1);
          if (recentLogin && recentLogin.length > 0 && recentLogin[0].sessionId) {
            await this.adminLoginHistoryService.recordLogout(recentLogin[0].sessionId, new Date());
          }
        }
      } catch (error) {
        this.logger.error('Failed to record logout', error);
        // Don't throw error - logout should succeed even if history recording fails
      }
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
      throw new BadRequestException('Không tìm thấy tài khoản với email này.');
    }

    // Check OTP
    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      throw new BadRequestException('Mã OTP không đúng. Vui lòng kiểm tra lại.');
    }

    // Check OTP expiration
    if (!user.passwordResetOtpExpiresAt || new Date() > user.passwordResetOtpExpiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.');
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
      throw new BadRequestException('Không tìm thấy tài khoản với email này.');
    }

    // Check OTP
    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      throw new BadRequestException('Mã OTP không đúng. Vui lòng kiểm tra lại.');
    }

    // Check OTP expiration
    if (!user.passwordResetOtpExpiresAt || new Date() > user.passwordResetOtpExpiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.');
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

  /**
   * Validate and create/update user from Google OAuth
   */
  async validateGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    picture?: string;
  }) {
    const { googleId, email, firstName, lastName, picture } = googleProfile;
    this.logger.log(`Google OAuth validation for email: ${email}`);

    // Find existing user by email
    let user = await this.userRepository.findOne({ where: { email } });

    if (user) {
      // User exists - check auth provider
      if (user.authProvider === 'local' && !user.googleId) {
        // Link Google account to existing local account
        this.logger.log(`Linking Google account to existing local user: ${email}`);
        user.googleId = googleId;
        user.authProvider = 'google'; // Update to Google as primary
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture;
        }
        await this.userRepository.save(user);
      } else if (user.authProvider === 'google' || user.googleId === googleId) {
        // Existing Google user - just login
        this.logger.log(`Existing Google user logging in: ${email}`);
        // Update avatar if changed
        if (picture && user.avatarUrl !== picture) {
          user.avatarUrl = picture;
          await this.userRepository.save(user);
        }
      } else {
        // Different auth provider
        throw new UnauthorizedException(
          `Email này đã được đăng ký bằng phương thức khác. Vui lòng sử dụng phương thức đăng nhập ban đầu.`
        );
      }
    } else {
      // New user - create account
      this.logger.log(`Creating new Google user: ${email}`);
      user = this.userRepository.create({
        email,
        firstName,
        lastName,
        googleId,
        authProvider: 'google',
        isActive: true, // Auto-verified for Google users
        avatarUrl: picture,
        password: undefined, // No password for Google users
      });
      await this.userRepository.save(user);
      this.logger.log(`New Google user created: ${email}`);
    }

    return user;
  }

  /**
   * Login with Google - similar to regular login but for Google OAuth users
   */
  async loginWithGoogle(user: User, userAgent: string, request: any) {
    this.logger.log(`Google login for user: ${user.email}`);

    // Extract IP address
    const { ipV4, ipV6 } = this.extractIpAddress(request);

    // Generate session ID
    const sessionId = this.generateSessionId();

    // Generate JWT tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id.toString(), refreshToken, userAgent, ipV4 || ipV6 || '');

    // Record successful login (only for admin users)
    if (user.role === 'admin') {
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = GeolocationUtil.getLocationFromIP(ipV4 || ipV6);
        const isNewDevice = await this.adminLoginHistoryService.isNewDevice(user.id, ipV4 || ipV6 || '');

        await this.adminLoginHistoryService.recordLogin({
          adminId: user.id,
          username: user.email,
          role: user.role,
          loginTime: new Date(),
          loginStatus: 'success',
          ipV4,
          ipV6,
          country: geo.country,
          city: geo.city,
          isp: null,
          browser,
          os,
          deviceType,
          userAgent,
          twoFaStatus: 'not_enabled',
          sessionId,
          isNewDevice,
          failedAttemptsBeforeSuccess: 0,
        });
      } catch (error) {
        this.logger.error('Failed to record Google login in admin history', error);
      }
    }

    // Return user info without sensitive data
    const { password: _pw, refreshToken: _rt, ...userWithoutSensitive } = user;
    return {
      accessToken,
      refreshToken,
      user: userWithoutSensitive,
    };
  }
}
