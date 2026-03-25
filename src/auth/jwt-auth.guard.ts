import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // Log auth check result
    console.log('=== AUTH CHECK RESULT ===');
    console.log('Error:', err);
    console.log('User:', user);
    console.log('Info:', info?.message || info);
    console.log('========================');
    
    // Handle token expired error
    if (info?.message === 'jwt expired') {
      console.log('🔴 Token expired, returning 401');
      throw new UnauthorizedException('Access token has expired. Please refresh.');
    }
    
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException('Access token is missing or invalid');
    }
    return user;
  }
}
