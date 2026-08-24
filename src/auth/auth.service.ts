import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt, randomUUID, createHash, timingSafeEqual } from 'crypto';
import { UAParser } from 'ua-parser-js';
import { t, DEFAULT_LANG } from '../i18n/auth-messages';
import { User } from '../entities/user.entity';
import { UserSession } from './user-session.entity';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { EmailService } from '../modules/email/email.service';
import { AdminLoginHistoryService } from './admin-login-history.service';
import { CreateAdminLoginHistoryDto } from './dto/admin-login-history.dto';
import { GeolocationUtil } from '../utils/geolocation.util';
import { NotificationService } from '../modules/notification/notification.service';
import { NotificationType } from '../entities/notification.entity';
import { OtpService } from '../modules/otp/otp.service';

// R8: a real bcrypt hash used to equalize login timing for accounts that have no
// credential (Google-only) or don't exist, so an attacker can't distinguish them by
// response time. Derived from a per-process random value (no hard-coded literal) so a
// static analyzer can't flag it, and so the digest is never a known constant.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(randomUUID(), 10);

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** 'access' | 'refresh' — makes the two token kinds non-interchangeable even
   *  if JWT_SECRET and JWT_REFRESH_SECRET were ever misconfigured to be equal. */
  type?: 'access' | 'refresh';
  /**
   * Session id — equals the `user_sessions.id` row created at login/refresh.
   * The access token is validated against this session on every request, so
   * deleting the session (logout / logout-all / refresh rotation) immediately
   * invalidates the access token (WSTG-SESS-06 — Logout Functionality).
   */
  sid?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Max wrong guesses allowed against a user-entity OTP before it is burned. */
  private static readonly MAX_OTP_ATTEMPTS = 5;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private jwtService: JwtService,
    private readonly configService: ConfigService,
    private emailService: EmailService,
    private adminLoginHistoryService: AdminLoginHistoryService,
    private readonly notificationService: NotificationService,
    private readonly otpService: OtpService,
  ) {}

  async register(registerDto: RegisterDto, lang: string = DEFAULT_LANG) {
    const { email, password, firstName, lastName } = registerDto;
    this.logger.log(`Registration attempt for email: ${email}`);

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Registration failed: User already exists - ${email}`);
      throw new ConflictException(t('register.emailAlreadyExists', lang));
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Enforce shared hourly OTP limit before generating/sending (counts the registration OTP)
    await this.otpService.checkAndRecordHourlySend(email);

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    this.logger.log(`Generated OTP for ${email}, expires at: ${otpExpiresAt.toISOString()}`);

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
        lang,
      });
      this.logger.log(`OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      throw error;
    }

    return {
      message: t('register.success', lang),
      email: user.email,
      requiresVerification: true,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto, request: any, lang: string = DEFAULT_LANG) {
    const { email, otp } = verifyOtpDto;
    const { ipV4: ipv4, ipV6: ipv6 } = this.extractIpAddress(request);
    this.logger.log(`OTP verification attempt for email: ${email}`);

    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      this.logger.warn(`OTP verification failed: User not found - ${email}`);
      // Generic error (same as a wrong OTP) so this endpoint can't be used to
      // enumerate which emails have an account. Legitimate users always have an
      // account at verify time, so this does not affect normal flow.
      throw new BadRequestException(t('verifyOtp.invalidOtp', lang));
    }

    this.logger.log(`User found: ${email}, isActive: ${user.isActive}`);

    // Check if already active
    if (user.isActive) {
      this.logger.warn(`OTP verification failed: Email already verified - ${email}`);
      throw new BadRequestException(t('verifyOtp.alreadyVerified', lang));
    }
    // Auth-F1: never re-activate an admin-disabled account via email verification.
    if (user.disabledAt) {
      this.logger.warn(`OTP verification blocked: account is disabled - ${email}`);
      throw new BadRequestException(t('verifyOtp.invalidOtp', lang));
    }

    // Check OTP presence
    if (!user.emailVerificationOtp || !user.otpExpiresAt) {
      this.logger.warn(`OTP verification failed: Invalid OTP for ${email}`);
      throw new BadRequestException(t('verifyOtp.invalidOtp', lang));
    }

    // Check OTP expiration
    if (new Date() > user.otpExpiresAt) {
      this.logger.warn(`OTP verification failed: OTP expired for ${email}. Expiry: ${user.otpExpiresAt}, Current: ${new Date()}`);
      throw new BadRequestException(t('verifyOtp.otpExpired', lang));
    }

    // Per-account attempt limiting done ATOMICALLY: a single conditional increment
    // (attempts < MAX). Previously this was a non-atomic read→compare→increment→save,
    // so concurrent guesses all read attempts<MAX and blew past the 5-cap, making the
    // low-entropy 6-digit code brute-forceable (M-O1). affected===0 ⇒ cap reached ⇒ burn.
    const inc = await this.userRepository.increment(
      { id: user.id, emailVerificationOtpAttempts: LessThan(AuthService.MAX_OTP_ATTEMPTS) },
      'emailVerificationOtpAttempts',
      1,
    );
    if (!inc.affected) {
      await this.userRepository.update(
        { id: user.id },
        { emailVerificationOtp: null as any, otpExpiresAt: null as any },
      );
      throw new BadRequestException(t('verifyOtp.invalidOtp', lang));
    }

    if (!this.otpEquals(user.emailVerificationOtp, otp)) {
      this.logger.warn(`OTP verification failed: Invalid OTP for ${email}`);
      // This wrong guess was already counted atomically above; burn if it hit the cap.
      if ((user.emailVerificationOtpAttempts ?? 0) + 1 >= AuthService.MAX_OTP_ATTEMPTS) {
        await this.userRepository.update(
          { id: user.id },
          { emailVerificationOtp: null as any, otpExpiresAt: null as any },
        );
      }
      throw new BadRequestException(t('verifyOtp.invalidOtp', lang));
    }

    // Activate user. F4: null (not undefined) so the code is actually cleared from the
    // row (save() skips undefined). Not replayable anyway (isActive guard), but consistent.
    user.isActive = true;
    user.emailVerificationOtp = null as any;
    user.otpExpiresAt = null as any;
    user.emailVerificationOtpAttempts = 0;
    await this.userRepository.save(user);
    this.logger.log(`User activated successfully: ${email}`);

    // Record OTP verification in login history (for admin users only)
    if (user.role === 'admin') {
      try {
        const userAgentStr: string = request.headers?.['user-agent'] || '';
        const { browser, os, deviceType } = this.parseUserAgent(userAgentStr);
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
          browser,
          os,
          deviceType,
          userAgent: userAgentStr || null,
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
      message: t('verifyOtp.success', lang),
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

  async resendOtp(resendOtpDto: ResendOtpDto, lang: string = DEFAULT_LANG) {
    const { email } = resendOtpDto;
    this.logger.log(`Resend OTP request for email: ${email}`);
    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    // Do not reveal whether the email has an account or is already verified —
    // return the same generic success either way (mirrors forgotPassword). Only a
    // real, still-unverified account actually gets a new OTP sent.
    // R8: also short-circuit for admin-disabled accounts. A banned user has isActive=false
    // (so it wouldn't hit the already-verified branch) but disabledAt set; without this it
    // could still trigger a fresh OTP email + reset the attempt counter. verifyOtp already
    // rejects disabledAt, so this only stops the pointless dispatch — same generic response.
    if (!user || user.isActive || user.disabledAt) {
      this.logger.warn(`Resend OTP no-op (unknown, already-verified, or disabled): ${email}`);
      return {
        message: t('resendOtp.success', lang),
        success: true,
      };
    }

    // Enforce shared hourly OTP limit before generating/sending
    await this.otpService.checkAndRecordHourlySend(email);

    // Generate new OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

    this.logger.log(`Generated new OTP for ${email}, expires at: ${otpExpiresAt.toISOString()}`);

    user.emailVerificationOtp = otp;
    user.otpExpiresAt = otpExpiresAt;
    user.emailVerificationOtpAttempts = 0;
    await this.userRepository.save(user);

    // Send OTP email
    try {
      await this.emailService.sendEmailVerification({
        to: email,
        userName: `${user.firstName} ${user.lastName}`,
        verificationCode: otp,
        expirationMinutes: 10,
        lang,
      });
      this.logger.log(`Resend OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to resend OTP email to ${email}:`, error);
      throw error;
    }

    return {
      message: t('resendOtp.success', lang),
      success: true,
    };
  }

  private generateOtp(): string {
    // Full 000000–999999 space (include leading-zero codes) for maximum entropy.
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }

  // R8: constant-time OTP comparison (was `!==`, a short-circuiting timing side-channel).
  // Consistent with the timingSafeEqual already used for refresh tokens / OAuth state.
  private otpEquals(stored: string | null | undefined, provided: string): boolean {
    if (!stored || typeof provided !== 'string' || stored.length !== provided.length) {
      return false;
    }
    try {
      return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(provided, 'utf8'));
    } catch {
      return false;
    }
  }

  /**
   * Verify a password-reset OTP against the user row, enforcing a per-account
   * attempt limit. On a wrong guess the attempt counter is incremented and the
   * OTP is burned once MAX_OTP_ATTEMPTS is reached, so the 6-digit space cannot
   * be brute-forced across many IPs (the controller throttle is per-IP only).
   * Throws a generic BadRequestException on any failure to avoid leaking whether
   * the email exists or the code was merely wrong.
   */
  private async assertValidPasswordResetOtp(user: User, otp: string, lang: string): Promise<void> {
    const invalid = () => new BadRequestException(t('resetPassword.invalidOtp', lang));

    if (!user.passwordResetOtp || !user.passwordResetOtpExpiresAt) {
      throw invalid();
    }

    if (new Date() > user.passwordResetOtpExpiresAt) {
      throw new BadRequestException(t('resetPassword.otpExpired', lang));
    }

    // ATOMIC attempt limiting (M-O1): conditional increment (attempts < MAX) so
    // concurrent guesses cannot all pass the cap check and brute-force the code.
    const inc = await this.userRepository.increment(
      { id: user.id, passwordResetOtpAttempts: LessThan(AuthService.MAX_OTP_ATTEMPTS) },
      'passwordResetOtpAttempts',
      1,
    );
    if (!inc.affected) {
      await this.userRepository.update(
        { id: user.id },
        { passwordResetOtp: null as any, passwordResetOtpExpiresAt: null as any },
      );
      throw invalid();
    }

    if (!this.otpEquals(user.passwordResetOtp, otp)) {
      // Wrong guess already counted atomically above; burn if it reached the cap.
      if ((user.passwordResetOtpAttempts ?? 0) + 1 >= AuthService.MAX_OTP_ATTEMPTS) {
        await this.userRepository.update(
          { id: user.id },
          { passwordResetOtp: null as any, passwordResetOtpExpiresAt: null as any },
        );
      }
      throw invalid();
    }

    // M3: correct code — refund the attempt budget so a subsequent legitimate step
    // (verify-reset-otp proved knowledge, then reset-password with the SAME code) is
    // not rejected by the atomic counter having reached MAX on correct submissions.
    await this.userRepository.update({ id: user.id }, { passwordResetOtpAttempts: 0 });
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

    // SECURITY (WSTG-BUSL-02 — IP Address Spoofing): never trust client-supplied
    // headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP, X-Client-IP) as the
    // source IP. Those are fully attacker-controllable and were previously read
    // first, letting a client forge its logged login IP.
    //
    // `request.ip` is the single source of truth. Express derives it from the
    // socket's remote address and, because `trust proxy` is pinned to
    // 'loopback' in main.ts, only honours an X-Forwarded-For entry contributed
    // by our own local reverse proxy (nginx) — a hop the client cannot bypass.
    // The raw socket address is kept only as a last-resort fallback.
    let ip: string | null =
      request.ip || request.socket?.remoteAddress || request.connection?.remoteAddress || null;
    if (ip) {
      this.logger.debug(`Resolved client IP from request.ip / socket: ${ip}`);
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
    return `sess_${randomUUID()}`;
  }

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Refresh tokens are hashed with SHA-256, not bcrypt.
   *
   * bcrypt silently truncates its input at 72 bytes. Every refresh token we
   * issue is a JWT whose first 72 bytes are the fixed header plus the opening
   * of the payload (`sub`/`email`), so ALL of a given user's refresh tokens
   * hashed to values that compared equal to one another. Session lookup by
   * token therefore matched an arbitrary session of that user, and logging out
   * of one device deleted a different device's session — leaving the caller's
   * own JWT alive (WSTG-SESS-06 — Testing for Logout Functionality).
   *
   * A fast hash is the correct primitive here: a refresh token is a signed,
   * high-entropy value, not a low-entropy password, so it needs no key
   * stretching — only a collision-free, length-independent digest.
   */
  private sha256(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async hashRefreshToken(refreshToken: string): Promise<string> {
    return this.sha256(refreshToken);
  }

  async validateRefreshToken(
    plainToken: string,
    hashedToken: string,
  ): Promise<boolean> {
    // Sessions created before the SHA-256 switch still carry a bcrypt hash;
    // keep verifying those so existing logins are not forcibly terminated.
    if (hashedToken.startsWith('$2')) {
      return bcrypt.compare(plainToken, hashedToken);
    }
    const candidate = Buffer.from(this.sha256(plainToken), 'hex');
    const stored = Buffer.from(hashedToken, 'hex');
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }

  /**
   * Verify a token's signature and return its payload, deliberately ignoring
   * expiry.
   *
   * Logout must keep working with an expired access token — the token is still
   * authentic proof that the caller owned that session. Verifying the
   * signature (rather than merely base64-decoding the payload, as the logout
   * routes used to do) is what prevents an attacker from forging a `sid`/`sub`
   * to terminate another user's session.
   */
  private verifyTokenIgnoringExpiry(
    token: string | undefined,
    kind: 'access' | 'refresh',
  ): JwtPayload | null {
    if (!token) return null;
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>(
          kind === 'refresh' ? 'JWT_REFRESH_SECRET' : 'JWT_SECRET',
        ),
        ignoreExpiration: true,
        algorithms: ['HS256'],
      });
    } catch {
      return null;
    }
  }

  async createSession(
    userId: string,
    refreshToken: string,
    userAgent: string,
    ipAddress: string,
    sessionId: string,
  ): Promise<UserSession> {
    const refreshTokenHash = await this.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Enforce a per-user session cap. If the user already has the maximum
    // number of active sessions, evict the oldest ones so that after this
    // insert the total stays at the cap.
    const MAX_SESSIONS_PER_USER = 10;
    const existingSessions = await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' }, // oldest first
    });
    if (existingSessions.length >= MAX_SESSIONS_PER_USER) {
      const evictCount =
        existingSessions.length - MAX_SESSIONS_PER_USER + 1;
      const sessionsToDelete = existingSessions.slice(0, evictCount);
      await this.sessionRepository.remove(sessionsToDelete);
    }

    // The row id is set explicitly so it matches the `sid` claim embedded in the
    // issued tokens, letting us revoke the access token by deleting this row.
    const session = this.sessionRepository.create({
      id: sessionId,
      userId,
      refreshTokenHash,
      userAgent,
      ipAddress,
      expiresAt,
    });

    return this.sessionRepository.save(session);
  }

  /**
   * Returns true when a session with this id still exists and has not expired.
   * Used by the JWT strategy to reject access tokens whose session was
   * terminated (logout, logout-all, or refresh-token rotation).
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) return false;
    if (session.expiresAt && new Date() > session.expiresAt) {
      await this.deleteSession(session.id);
      return false;
    }
    return true;
  }

  /**
   * Resolve the session a refresh token belongs to.
   *
   * The session is addressed by the token's own `sid` claim, so exactly one
   * row can ever match. The previous implementation scanned every session of
   * the user and returned the first whose hash "matched" — which, combined
   * with the bcrypt truncation described on hashRefreshToken(), routinely
   * returned the wrong session and broke logout.
   *
   * The signature is verified before the claim is trusted, and the row is then
   * bound back to this exact token, so neither a forged `sid` nor a stale
   * token can address a session it does not own.
   */
  async findSessionByToken(
    userId: string,
    refreshToken: string,
  ): Promise<UserSession | null> {
    const payload = this.verifyTokenIgnoringExpiry(refreshToken, 'refresh');
    if (!payload?.sid || String(payload.sub) !== String(userId)) {
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sid, userId: String(userId) },
    });
    if (!session) return null;

    const matches = await this.validateRefreshToken(
      refreshToken,
      session.refreshTokenHash,
    );
    return matches ? session : null;
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

  generateTokens(user: User, sessionId: string): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload: JwtPayload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role || 'customer',
      sid: sessionId,
    };

    const accessToken = this.jwtService.sign(
      { ...payload, type: 'access' },
      { expiresIn: '30m' },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      { secret: this.getRefreshSecret(), expiresIn: '30d' },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh-token signing/verification secret. Fails closed: it MUST be configured
   * and MUST differ from JWT_SECRET, otherwise a 30-day refresh token would verify
   * as an access token (identical payload, same secret) and become directly usable.
   */
  private getRefreshSecret(): string {
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    if (secret === this.configService.get<string>('JWT_SECRET')) {
      throw new Error('JWT_REFRESH_SECRET must be set and must differ from JWT_SECRET');
    }
    return secret;
  }

  async login(loginDto: LoginDto, userAgent: string, request: any, lang: string = DEFAULT_LANG, adminOnly = false) {
    const { email, password } = loginDto;

    // Always extract IP from server-side headers; never trust client-supplied values
    const { ipV4, ipV6 } = this.extractIpAddress(request);

    this.logger.debug(`Login attempt - Email: ${email}, IPv4: ${ipV4}, IPv6: ${ipV6}`);

    // Resolve geolocation once: prefer browser coordinates over IP lookup
    const resolveGeo = async () => {
      if (loginDto.latitude != null && loginDto.longitude != null) {
        this.logger.debug(`Using browser coordinates for geo: (${loginDto.latitude}, ${loginDto.longitude})`);
        return GeolocationUtil.getLocationFromCoordinates(loginDto.latitude, loginDto.longitude);
      }
      return GeolocationUtil.getLocationFromIP(ipV4 || ipV6);
    };

    // Find user. password is select:false on the entity, so opt it in explicitly
    // here — it is required for the bcrypt comparison below.
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .addSelect('user.password')
      .getOne();

    // Record failed login attempt if user not found
    // Only record if request is from admin panel (adminOnly=true) — prevents regular user
    // failed attempts from polluting the admin login history
    if (!user) {
      if (adminOnly) {
        try {
          const { browser, os, deviceType } = this.parseUserAgent(userAgent);
          const geo = await resolveGeo();

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
      }

      // Don't reveal that email doesn't exist (security)
      throw new UnauthorizedException(t('login.invalidCredentials', lang));
    }

    // Check if user has password (local auth) or is Google OAuth user
    if (!user.password) {
      // R8: a Google-only account previously returned a DISTINCT `login.noPassword` error
      // BEFORE any password check — a pre-auth oracle revealing the account exists and uses
      // Google SSO. Run a dummy compare (equalize timing) and return the SAME generic error
      // as a wrong password / unknown email, so login leaks nothing about the account.
      this.logger.warn(`Login attempt with password for OAuth user without password: ${email}`);
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedException(t('login.invalidCredentials', lang));
    }

    // Check password first (before checking email verification)
    // This ensures we don't leak information about unverified accounts
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Only record failed login if: from admin panel OR the user is an admin
      if (adminOnly || user.role === 'admin') {
        try {
          const { browser, os, deviceType } = this.parseUserAgent(userAgent);
          const geo = await resolveGeo();

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
      }

      // Don't reveal that email exists (security)
      throw new UnauthorizedException(t('login.invalidCredentials', lang));
    }

    // Reject non-admin accounts when called from the admin-login endpoint
    if (adminOnly && user.role !== 'admin') {
      this.logger.warn(`Admin-only login rejected for non-admin: ${email} (role: ${user.role})`);
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = await resolveGeo();
        await this.adminLoginHistoryService.recordLogin({
          adminId: null,
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
        this.logger.error('Failed to record non-admin login attempt', error);
      }
      throw new UnauthorizedException(t('login.invalidCredentials', lang));
    }

    // Auth-F1: an admin-disabled account must NOT be treated as merely "unverified".
    // Reject it here (same generic error as the Google path) so it can't self-unban via
    // the OTP-reissue + verify-otp flow. disabledAt is set only on admin deactivation.
    if (user.disabledAt) {
      this.logger.warn(`Login rejected: account is disabled - ${email}`);
      throw new UnauthorizedException(t('login.invalidCredentials', lang));
    }

    // Check if email is verified - if not, generate and send new OTP
    if (!user.isActive) {
      this.logger.log(`Login attempt with unverified account: ${email}`);

      // Enforce shared hourly OTP limit (silently skip send if limit hit — don't block login flow)
      try {
        await this.otpService.checkAndRecordHourlySend(email);
      } catch {
        // Limit reached: return verification required without sending a new OTP
        return {
          requiresVerification: true,
          email: user.email,
          message: t('login.requiresVerification', lang, { email: user.email }),
        };
      }

      // Generate new OTP
      const otp = this.generateOtp();
      const otpExpiresAt = new Date();
      otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10);

      this.logger.log(`Generated new OTP for unverified login: ${email}, expires at: ${otpExpiresAt.toISOString()}`);

      // Update user with new OTP. Reset the attempt counter (M2): the atomic
      // burn-after-5 counter strictly enforces now, so a freshly issued OTP must start
      // a fresh budget or it would be dead-on-arrival after a prior lockout.
      user.emailVerificationOtp = otp;
      user.otpExpiresAt = otpExpiresAt;
      user.emailVerificationOtpAttempts = 0;
      await this.userRepository.save(user);

      // Send OTP email
      try {
        await this.emailService.sendEmailVerification({
          to: email,
          userName: `${user.firstName} ${user.lastName}`,
          verificationCode: otp,
          expirationMinutes: 10,
          lang,
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
        message: t('login.requiresVerification', lang, { email: user.email }),
      };
    }

    // Session id: shared by the issued tokens (`sid` claim), the user_sessions
    // row, and the admin login-history record so all three correlate and the
    // access token can be revoked on logout.
    const sessionId = randomUUID();

    // Generate JWT tokens
    const { accessToken, refreshToken } = this.generateTokens(user, sessionId);

    // Create session
    await this.createSession(user.id.toString(), refreshToken, userAgent, ipV4 || ipV6 || '', sessionId);

    // Record successful login (only for admin users)
    if (user.role === 'admin') {
      try {
        const { browser, os, deviceType } = this.parseUserAgent(userAgent);
        const geo = await resolveGeo();
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
    const userWithoutSensitive = this.sanitizeUser(user);

    // Notify user: login success
    const ip = ipV4 || ipV6;
    await this.notificationService.notify(
      user.id,
      NotificationType.ACCOUNT_LOGIN,
      t('notifications.loginTitle', 'vi'),
      t('notifications.loginBody', 'vi', { ipSuffix: ip ? t('notifications.loginIpSuffix', 'vi', { ip }) : '' }),
      { ip: ip || 'unknown' },
      t('notifications.loginTitle', 'en'),
      t('notifications.loginBody', 'en', { ipSuffix: ip ? t('notifications.loginIpSuffix', 'en', { ip }) : '' }),
    );

    return {
      accessToken,
      refreshToken,
      user: userWithoutSensitive,
    };
  }

  private sanitizeUser(user: User) {
    const {
      password: _pw,
      refreshToken: _rt,
      refreshTokenExpiresAt: _rtea,
      emailVerificationOtp: _evo,
      otpExpiresAt: _oea,
      passwordResetOtp: _pro,
      passwordResetOtpExpiresAt: _proea,
      ...sanitized
    } = user as any;
    return sanitized;
  }

  async validateUser(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(t('validateUser.userNotFound', DEFAULT_LANG));
    }
    // A deactivated account must lose access immediately — not keep every live
    // session and keep minting 30-day refreshes. JwtStrategy calls this on every
    // request, so flipping isActive=false takes effect on the next call.
    if (user.isActive === false) {
      throw new UnauthorizedException('Account is deactivated');
    }
    return this.sanitizeUser(user);
  }

  async refresh(
    refreshToken: string,
    userAgent: string,
    request: any,
    lang: string = DEFAULT_LANG,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Extract real IP from request
    const { ipV4, ipV6 } = this.extractIpAddress(request);
    const ipAddress = ipV4 || ipV6 || '';
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.getRefreshSecret(),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(t('refresh.jwtExpired', lang));
    }

    // Reject an access token presented at the refresh endpoint (type must be refresh).
    if (payload.type && payload.type !== 'refresh') {
      throw new UnauthorizedException(t('refresh.invalidSession', lang));
    }

    const session = await this.findSessionByToken(payload.sub, refreshToken);
    if (!session) {
      throw new UnauthorizedException(t('refresh.invalidSession', lang));
    }

    if (new Date() > session.expiresAt) {
      await this.deleteSession(session.id);
      throw new UnauthorizedException(t('refresh.sessionExpired', lang));
    }

    const user = await this.userRepository.findOne({
      where: { id: parseInt(payload.sub) }
    });
    if (!user || user.isActive === false) {
      // Missing OR deactivated account cannot refresh (M-A2).
      await this.deleteSession(session.id);
      throw new UnauthorizedException(t('validateUser.userNotFound', lang));
    }

    // Token rotation: delete old session
    await this.deleteSession(session.id);

    // Rotate the session id along with the tokens.
    const newSessionId = randomUUID();

    // Generate new tokens
    const tokens = this.generateTokens(user, newSessionId);

    // Create new session
    await this.createSession(
      user.id.toString(),
      tokens.refreshToken,
      userAgent,
      ipAddress,
      newSessionId,
    );

    return tokens;
  }

  /**
   * Terminate the caller's current session.
   *
   * The access token is the primary source of truth: it is the credential the
   * caller is actually authenticated with, and its `sid` claim names precisely
   * the session to destroy. The refresh-token cookie is only a fallback for
   * clients that no longer hold an access token.
   *
   * Previously this depended solely on the refresh cookie and resolved the
   * session by scanning hashes, so a logout could silently delete the wrong
   * session (or none at all) while still answering 200 — leaving the caller's
   * JWT usable afterwards (WSTG-SESS-06).
   *
   * Returns true when a session was actually deleted.
   */
  async logout(accessToken?: string, refreshToken?: string): Promise<boolean> {
    const payload =
      this.verifyTokenIgnoringExpiry(accessToken, 'access') ??
      this.verifyTokenIgnoringExpiry(refreshToken, 'refresh');

    if (!payload?.sid || !payload?.sub) {
      this.logger.warn('Logout called without a verifiable session-bound token');
      return false;
    }

    const session = await this.sessionRepository.findOne({
      where: { id: payload.sid, userId: String(payload.sub) },
    });
    if (!session) return false;

    await this.deleteSession(session.id);

    // Record logout in login history (for admin users). The admin history row
    // stores the same id as `sid`, so the correct row is addressed directly
    // instead of guessing at the user's most recent login.
    try {
      const user = await this.userRepository.findOne({
        where: { id: parseInt(String(payload.sub)) },
      });
      if (user && user.role === 'admin') {
        await this.adminLoginHistoryService.recordLogout(payload.sid, new Date());
      }
    } catch (error) {
      this.logger.error('Failed to record logout', error);
      // Don't throw error - logout should succeed even if history recording fails
    }

    return true;
  }

  async logoutAll(userId: string): Promise<void> {
    await this.deleteAllUserSessions(userId);
  }

  /**
   * Terminate every session belonging to the caller.
   *
   * The owning user is taken from a signature-verified token. Previously the
   * `sub` claim was read by base64-decoding the cookie with no verification at
   * all, so anyone could craft an unsigned token carrying another user's id
   * and forcibly log that user out of every device.
   */
  async logoutAllByToken(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<boolean> {
    const payload =
      this.verifyTokenIgnoringExpiry(accessToken, 'access') ??
      this.verifyTokenIgnoringExpiry(refreshToken, 'refresh');

    if (!payload?.sub) return false;

    await this.logoutAll(String(payload.sub));
    return true;
  }

  /**
   * Forgot Password - Send OTP to email
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto, lang: string = DEFAULT_LANG) {
    const { email } = forgotPasswordDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // Do NOT reveal whether the email is registered: return the same generic
      // success response as the happy path so this endpoint can't be used as an
      // account-existence oracle.
      this.logger.log(`forgotPassword requested for non-existent email: ${email}`);
      return {
        message: t('forgotPassword.success', lang),
        email,
        success: true,
      };
    }

    // Enforce shared hourly OTP limit before generating/sending
    await this.otpService.checkAndRecordHourlySend(email);

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    // Save OTP to user; reset the per-account attempt counter for the new code.
    user.passwordResetOtp = otp;
    user.passwordResetOtpExpiresAt = otpExpiresAt;
    user.passwordResetOtpAttempts = 0;
    await this.userRepository.save(user);

    // Send OTP email
    await this.emailService.sendPasswordReset({
      to: email,
      userName: `${user.firstName} ${user.lastName}`,
      resetCode: otp,
      expirationMinutes: 10,
      lang,
    });

    return {
      message: t('forgotPassword.success', lang),
      email,
      success: true,
    };
  }

  /**
   * Verify Reset OTP
   */
  async verifyResetOtp(verifyResetOtpDto: VerifyResetOtpDto, lang: string = DEFAULT_LANG) {
    const { email, otp } = verifyResetOtpDto;

    // Find user. Use the same generic invalid-OTP error for a missing user so
    // this endpoint cannot be used to enumerate registered emails.
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException(t('verifyResetOtp.invalidOtp', lang));
    }

    // Verify OTP with per-account attempt limiting.
    await this.assertValidPasswordResetOtp(user, otp, lang);

    return {
      message: t('verifyResetOtp.success', lang),
      success: true,
    };
  }

  /**
   * Reset Password - Change password with OTP
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto, lang: string = DEFAULT_LANG) {
    const { email, otp, newPassword } = resetPasswordDto;

    // Find user. Use the same generic invalid-OTP error for a missing user so
    // this endpoint cannot be used to enumerate registered emails.
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException(t('resetPassword.invalidOtp', lang));
    }

    // Verify OTP with per-account attempt limiting.
    await this.assertValidPasswordResetOtp(user, otp, lang);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP. M1: use null (not undefined) — TypeORM save()
    // SKIPS undefined columns, so the reset OTP was never actually cleared and stayed
    // replayable within its 10-min window (account re-takeover). null is persisted.
    user.password = hashedPassword;
    user.passwordResetOtp = null as any;
    user.passwordResetOtpExpiresAt = null as any;
    user.passwordResetOtpAttempts = 0;
    await this.userRepository.save(user);

    // SECURITY: Invalidate all existing sessions/refresh tokens after password
    // reset so that any attacker who previously obtained credentials or a
    // session is forcefully logged out and must re-authenticate.
    try {
      await this.deleteAllUserSessions(String(user.id));
    } catch (err) {
      this.logger.error(`Failed to invalidate sessions after password reset for user ${user.id}: ${err?.message}`);
    }

    // Notify user: password reset success
    await this.notificationService.notify(
      user.id,
      NotificationType.PASSWORD_RESET,
      t('notifications.passwordResetTitle', 'vi'),
      t('notifications.passwordResetBody', 'vi'),
      undefined,
      t('notifications.passwordResetTitle', 'en'),
      t('notifications.passwordResetBody', 'en'),
    );

    return {
      message: t('resetPassword.success', lang),
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
  }, lang: string = DEFAULT_LANG) {
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
        // R8: if the pre-existing local row was merely UNVERIFIED (isActive=false, no ban),
        // verified Google ownership of the address proves the email — activate it, same as a
        // brand-new Google user is auto-verified. Otherwise an attacker who pre-registered the
        // victim's Gmail (and never verified) would permanently block the victim's Google SSO
        // (loginWithGoogle rejects isActive===false). Do NOT clear an admin ban: only flip
        // when disabledAt is null, so a banned account can't be reactivated via Google.
        if (user.isActive === false && !user.disabledAt) {
          user.isActive = true;
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
        throw new UnauthorizedException(t('googleAuth.differentProvider', lang));
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
  async loginWithGoogle(user: User, userAgent: string, request: any, lang: string = DEFAULT_LANG) {
    this.logger.log(`Google login for user: ${user.email}`);

    // M9: a deactivated (admin-banned) account must not be able to re-login via Google
    // and mint a fresh session — the password login path already blocks isActive=false,
    // but this path minted tokens unconditionally, letting a banned user regain a
    // session (and, via the terminal gateway, a root shell).
    if (user.isActive === false) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Extract IP address
    const { ipV4, ipV6 } = this.extractIpAddress(request);

    // Session id: shared by the issued tokens (`sid` claim), the user_sessions
    // row, and the admin login-history record so all three correlate and the
    // access token can be revoked on logout.
    const sessionId = randomUUID();

    // Generate JWT tokens
    const { accessToken, refreshToken } = this.generateTokens(user, sessionId);

    // Create session
    await this.createSession(user.id.toString(), refreshToken, userAgent, ipV4 || ipV6 || '', sessionId);

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
    const userWithoutSensitive = this.sanitizeUser(user);

    // Notify user: Google login success
    const googleIp = ipV4 || ipV6;
    await this.notificationService.notify(
      user.id,
      NotificationType.ACCOUNT_LOGIN,
      t('notifications.googleLoginTitle', 'vi'),
      t('notifications.googleLoginBody', 'vi', { ipSuffix: googleIp ? t('notifications.loginIpSuffix', 'vi', { ip: googleIp }) : '' }),
      { ip: googleIp || 'unknown', provider: 'google' },
      t('notifications.googleLoginTitle', 'en'),
      t('notifications.googleLoginBody', 'en', { ipSuffix: googleIp ? t('notifications.loginIpSuffix', 'en', { ip: googleIp }) : '' }),
    );

    return {
      accessToken,
      refreshToken,
      user: userWithoutSensitive,
    };
  }
}
