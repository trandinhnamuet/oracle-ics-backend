import { Controller, Post, Body, Res, UseGuards, Get, Req, Headers, Logger, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { extractLang, t } from '../i18n/auth-messages';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions(maxAge?: number) {
    const options: any = {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const, // Changed from 'strict' to 'lax' for better cross-domain compatibility
      maxAge: maxAge || 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    };

    // Add domain for production to ensure cookie works across subdomains
    const cookieDomain = this.configService.get('COOKIE_DOMAIN');
    if (cookieDomain) {
      options.domain = cookieDomain;
    }

    return options;
  }

  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Register request: ${JSON.stringify({ email: registerDto.email })}`);
    return await this.authService.register(registerDto, lang);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Verify OTP request: ${JSON.stringify(verifyOtpDto)}`);
    return await this.authService.verifyOtp(verifyOtpDto, lang);
  }

  @Post('resend-otp')
  async resendOtp(
    @Body() resendOtpDto: ResendOtpDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    this.logger.log(`Resend OTP request: ${JSON.stringify(resendOtpDto)}`);
    return await this.authService.resendOtp(resendOtpDto, lang);
  }

  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.forgotPassword(forgotPasswordDto, lang);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(
    @Body() verifyResetOtpDto: VerifyResetOtpDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.verifyResetOtp(verifyResetOtpDto, lang);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Headers('accept-language') acceptLang?: string,
  ) {
    const lang = extractLang(acceptLang);
    return await this.authService.resetPassword(resetPasswordDto, lang);
  }

  @Post('login')
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
    response.cookie('refreshToken', result.refreshToken, this.getCookieOptions());

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
    const refreshToken = req.cookies?.refreshToken as string | undefined;
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
    response.cookie('refreshToken', tokens.refreshToken, this.getCookieOptions());

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    // Decode userId from the refreshToken cookie (no verification needed — we just need the sub claim
    // to invalidate the token in DB). This works even when the accessToken is expired.
    let userId: string | undefined;
    if (refreshToken) {
      try {
        const payload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString('utf-8'));
        userId = String(payload.sub);
      } catch (_) { /* invalid token format — still clear the cookie below */ }
    }

    if (refreshToken && userId && userId !== 'undefined') {
      await this.authService.logout(userId, refreshToken);
    }

    // Always clear the cookie regardless of token validity
    const clearOptions = this.getCookieOptions(0);
    delete clearOptions.maxAge;
    response.clearCookie('refreshToken', clearOptions);

    return { message: t('common.logoutSuccess', lang) };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const lang = extractLang(req.headers['accept-language'] as string);
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    let userId: string | undefined;
    if (refreshToken) {
      try {
        const payload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString('utf-8'));
        userId = String(payload.sub);
      } catch (_) { /* invalid token format */ }
    }

    if (userId && userId !== 'undefined') {
      await this.authService.logoutAll(userId);
    }

    // Always clear the cookie regardless of token validity
    const clearOptions = this.getCookieOptions(0);
    delete clearOptions.maxAge;
    response.clearCookie('refreshToken', clearOptions);

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
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard redirects to Google OAuth
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
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

      // Set refresh token cookie
      response.cookie('refreshToken', result.refreshToken, this.getCookieOptions());

      // Get frontend URL from env
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

      // Redirect to frontend with access token
      response.redirect(`${frontendUrl}/auth/callback?token=${result.accessToken}`);
    } catch (error) {
      this.logger.error('Google OAuth callback error:', error);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      response.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}
