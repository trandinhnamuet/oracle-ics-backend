import { Controller, Post, Body, Res, UseGuards, Get, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(registerDto);
    
    // Set JWT token in HTTP-only cookie
    response.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours - khớp với JWT expiry
    });

    return { user: result.user };
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(loginDto);
    
    // Set JWT token in HTTP-only cookie
    response.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours - khớp với JWT expiry
    });

    return { user: result.user };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token');
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: Request) {
    return req.user;
  }
}
