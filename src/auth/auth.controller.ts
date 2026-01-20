import { Controller, Post, Body, Res, UseGuards, Get, Req, Logger, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto, RegisterDto, VerifyOtpDto, ResendOtpDto, ForgotPasswordDto, VerifyResetOtpDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions(maxAge?: number) {
    return {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict' as const,
      maxAge: maxAge || 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    };
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    this.logger.log(`Register request: ${JSON.stringify({ email: registerDto.email })}`);
    return await this.authService.register(registerDto);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    this.logger.log(`Verify OTP request: ${JSON.stringify(verifyOtpDto)}`);
    return await this.authService.verifyOtp(verifyOtpDto);
  }

  @Post('resend-otp')
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    this.logger.log(`Resend OTP request: ${JSON.stringify(resendOtpDto)}`);
    return await this.authService.resendOtp(resendOtpDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() verifyResetOtpDto: VerifyResetOtpDto) {
    return await this.authService.verifyResetOtp(verifyResetOtpDto);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto, 
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Extract real IP from proxy headers
    const result = await this.authService.login(loginDto, userAgent, req);
    
    // Set refresh token as httpOnly cookie
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
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const userAgent = req.headers['user-agent'] || '';

    const tokens = await this.authService.refresh(
      refreshToken,
      userAgent,
      req,
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
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    const userId = (req.user as any)?.sub as string;

    if (refreshToken) {
      await this.authService.logout(userId, refreshToken);
    }

    // Clear refresh token cookie
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userId = (req.user as any)?.sub as string;

    await this.authService.logoutAll(userId);

    // Clear refresh token cookie
    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Logged out from all devices successfully' };
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
}
