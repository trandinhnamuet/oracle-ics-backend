import { Controller, Post, Body, Res, UseGuards, Get, Req, Headers, Logger, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleOAuthGuard } from './google-oauth.guard';
import { extractLang, t } from '../i18n/auth-messages';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Xác định tên cookie refresh token dựa vào Origin header của request.
   * admin.oraclecloud.vn → 'adminRefreshToken' (tách biệt với user session)
   * oraclecloud.vn      → 'refreshToken'
   */
  private getRefreshTokenCookieName(req: Request): string {
    const origin = (req.headers['origin'] as string) || '';
    const referer = (req.headers['referer'] as string) || '';
    if (origin.includes('admin.') || referer.includes('admin.')) {
      return 'adminRefreshToken';
    }
    return 'refreshToken';
  }

  /**
   * Locate the caller's access token, mirroring how JwtStrategy extracts it
   * (Authorization: Bearer first, then the access_token cookie).
   */
  private getAccessToken(req: Request): string | undefined {
    const authHeader = (req.headers['authorization'] as string) || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim() || undefined;
    }
    return (req.cookies?.access_token as string) || undefined;
  }

  /**
   * Cookie scope for the refresh token.
   *
   * The refresh token is only ever presented to the auth endpoints (refresh,
   * logout, logout-all), so the cookie is scoped to just those. Path is matched
   * by the browser against the OUTWARD-FACING URL, so it is '/api/auth' even
   * though nginx strips '/api' before the request reaches this service; set
   * REFRESH_COOKIE_PATH='/auth' when talking to the backend port directly in
   * local development.
   *
   * It used to be '/', which sent the token to every path on the domain — any
   * other app or vulnerable route sharing the domain would receive it. Page
   * routes no longer need it: the front-ends establish the session client-side
   * by refreshing against this cookie and redirect to /login when that fails.
   */
  private getRefreshCookiePath(): string {
    return this.configService.get<string>('REFRESH_COOKIE_PATH') || '/api/auth';
  }

  private getCookieOptions(maxAge?: number) {
    const options: any = {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      // Use nullish coalescing so maxAge=0 is not treated as falsy
      maxAge: maxAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
      path: this.getRefreshCookiePath(),
    };

    // Domain is intentionally unset by default, which makes the cookie host-only
    // (bound to the exact issuing host). A dot-prefixed COOKIE_DOMAIN such as
    // '.oraclecloud.vn' would broadcast the refresh token to every subdomain, so
    // any other app or vulnerable host sharing the domain would receive it. Admin
    // and customer sessions already use separate cookie names on separate
    // subdomains, so no cross-subdomain sharing is required.
    const cookieDomain = this.configService.get('COOKIE_DOMAIN');
    if (cookieDomain) {
      options.domain = cookieDomain;
    }

    return options;
  }


  /**
   * Issue the refresh-token cookie.
   *
   * There used to be a companion "session hint" cookie at Path=/ so the Next.js
   * middleware could tell whether a session existed. Scoping any cookie to the
   * whole site is exactly what we narrowed the refresh cookie to avoid, so the
   * hint is gone: the front-ends now decide client-side, by attempting a token
   * refresh against the HttpOnly cookie, and redirect to /login if it fails.
   */
  private setAuthCookies(
    req: Request,
    response: Response,
    cookieName: string,
    refreshToken: string | undefined,
    role?: string,
  ) {
    if (!refreshToken) return; // e.g. a login that stopped at "verification required"
    response.cookie(cookieName, refreshToken, this.getCookieOptions());
  }

  /** Clear the refresh cookie, using the same path it was set on. */
  private clearAuthCookies(req: Request, response: Response, cookieName: string) {
    const clearOptions = this.getCookieOptions(0);
    delete clearOptions.maxAge;
    response.clearCookie(cookieName, clearOptions);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Register request: ${JSON.stringify({ email: registerDto.email })}`);
    return await this.authService.register(registerDto, lang);
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Req() req: Request,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Verify OTP request for email: ${verifyOtpDto.email}`);
    return await this.authService.verifyOtp(verifyOtpDto, req, lang);
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendOtp(
    @Body() resendOtpDto: ResendOtpDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Resend OTP request: ${JSON.stringify(resendOtpDto)}`);
    return await this.authService.resendOtp(resendOtpDto, lang);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.forgotPassword(forgotPasswordDto, lang);
  }

  // Reset-OTP verification is a guessing target: a 6-digit code is only 10^6
  // values, so without an endpoint-specific limit a distributed attacker can
  // brute-force it. 5 attempts per minute per IP, on top of the per-account
  // hourly send limit enforced in the service.
  @Post('verify-reset-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyResetOtp(
    @Body() verifyResetOtpDto: VerifyResetOtpDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.verifyResetOtp(verifyResetOtpDto, lang);
  }

  // Same reasoning: the reset itself carries the OTP, so it is equally a
  // guessing surface and needs its own limit.
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.resetPassword(resetPasswordDto, lang);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto, 
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const userAgent = req.headers['user-agent'] || '';
    
    // Extract real IP from proxy headers
    const result = await this.authService.login(loginDto, userAgent, req, lang);
    
    // Check if verification is required (unverified account)
    if ('requiresVerification' in result && result.requiresVerification) {
      this.logger.log(`Login requires verification for: ${result.email}`);
      // Return verification response without setting cookies
      return {
        requiresVerification: result.requiresVerification,
        email: result.email,
        message: result.message,
      };
    }
    
    // Normal login flow - set refresh token as httpOnly cookie
    // Use different cookie name for admin vs user to isolate sessions between subdomains
    const loginCookieName = this.getRefreshTokenCookieName(req);
    this.setAuthCookies(req, response, loginCookieName, result.refreshToken, result.user?.role);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('admin-login')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const userAgent = req.headers['user-agent'] || '';

    // adminOnly = true: non-admin accounts are rejected with same generic 401
    const result = await this.authService.login(loginDto, userAgent, req, lang, true);

    if ('requiresVerification' in result && result.requiresVerification) {
      return {
        requiresVerification: result.requiresVerification,
        email: result.email,
        message: result.message,
      };
    }

    const loginCookieName = this.getRefreshTokenCookieName(req);
    this.setAuthCookies(req, response, loginCookieName, result.refreshToken, result.user?.role);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const refreshCookieName = this.getRefreshTokenCookieName(req);
    const refreshToken = req.cookies?.[refreshCookieName] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException(t('common.refreshTokenNotFound', lang));
    }

    const userAgent = req.headers['user-agent'] || '';

    const tokens = await this.authService.refresh(
      refreshToken,
      userAgent,
      req,
      lang,
    );

    // Set new refresh token as httpOnly cookie (token rotation)
    this.setAuthCookies(req, response, refreshCookieName, tokens.refreshToken, (req as any).user?.role);

    // The refresh token is delivered ONLY as an HttpOnly cookie (set above).
    // It used to be echoed in this JSON body as well, which handed a 30-day
    // credential to any script running on the page and defeated the point of
    // making the cookie HttpOnly. No client reads it from here.
    return {
      success: true,
      accessToken: tokens.accessToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const refreshCookieName = this.getRefreshTokenCookieName(req);
    const refreshToken = req.cookies?.[refreshCookieName] as string | undefined;

    // The access token names the exact session to terminate via its `sid`
    // claim; the refresh cookie is only a fallback for clients that no longer
    // hold one. Both are signature-verified inside the service, so neither can
    // be forged to destroy another user's session.
    await this.authService.logout(this.getAccessToken(req), refreshToken);

    // Always clear both cookies regardless of token validity
    this.clearAuthCookies(req, response, refreshCookieName);

    return { message: t('common.logoutSuccess', lang) };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const refreshCookieName = this.getRefreshTokenCookieName(req);
    const refreshToken = req.cookies?.[refreshCookieName] as string | undefined;

    // The owning user is read from a signature-verified token. Base64-decoding
    // the cookie without verification (as this used to do) let anyone forge a
    // `sub` and log an arbitrary user out of every device.
    await this.authService.logoutAllByToken(this.getAccessToken(req), refreshToken);

    // Always clear both cookies regardless of token validity
    this.clearAuthCookies(req, response, refreshCookieName);

    return { message: t('common.logoutAllSuccess', lang) };
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getCurrentUser(@Req() req: Request) {
    return { user: req.user };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: Request) {
    return req.user;
  }

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {
    // Guard redirects to Google OAuth
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthCallback(
    @Req() req: Request,
    @Res() response: Response,
  ) {
    try {
      const googleUser = req.user as any;
      const userAgent = req.headers['user-agent'] || '';
      const lang = extractLang(req.headers['accept-language'] as string);

      // Validate user from Google profile
      const user = await this.authService.validateGoogleUser(googleUser, lang);

      // Login with Google
      const result = await this.authService.loginWithGoogle(user, userAgent, req, lang);

      // Set refresh token cookie — admin users get adminRefreshToken
      const googleCookieName = user.role === 'admin' ? 'adminRefreshToken' : 'refreshToken';
      this.setAuthCookies(req, response, googleCookieName, result.refreshToken, user.role);

      // Get frontend URL from env - for admin users, use FRONTEND_URL_ADMIN if available
      let frontendUrl = 'http://localhost:3000';
      
      // Check if user is admin - if so, try to use FRONTEND_URL_ADMIN
      if (user.role === 'admin') {
        const adminUrl = this.configService.get<string>('FRONTEND_URL_ADMIN');
        if (adminUrl) {
          frontendUrl = adminUrl;
        } else {
          // Fallback: Try to use FRONTEND_URL with /admin path if it's a base URL
          const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
          frontendUrl = baseUrl;
        }
      } else {
        frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      }

      // Redirect WITHOUT the token. It used to be appended as ?token=<jwt>, which
      // leaves a live credential in browser history, server and proxy logs, the
      // Referer header of anything the landing page loads, and any screenshot of
      // the address bar. The refresh cookie was already set above, so the callback
      // page obtains an access token by calling /auth/refresh instead.
      response.redirect(`${frontendUrl}/auth/callback`);
    } catch (error) {
      this.logger.error('Google OAuth callback error:', error);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      response.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}
