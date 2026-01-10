import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Log toàn bộ nội dung request
    console.log('=== FRONTEND REQUEST ===');
    console.log('Method:', request.method);
    console.log('URL:', request.url);
    console.log('Headers:', JSON.stringify(request.headers, null, 2));
    console.log('Query:', JSON.stringify(request.query, null, 2));
    console.log('Body:', JSON.stringify(request.body, null, 2));
    console.log('Cookies:', JSON.stringify(request.cookies, null, 2));
    console.log('Raw Cookies:', request.get('cookie'));
    console.log('Authorization Header:', request.get('authorization'));
    console.log('User:', request.user);
    console.log('========================');
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // Log auth check result
    console.log('=== AUTH CHECK RESULT ===');
    console.log('Error:', err);
    console.log('User:', user);
    console.log('Info:', info?.message || info);
    console.log('========================');
    
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException('Access token is missing or invalid');
    }
    return user;
  }
}
