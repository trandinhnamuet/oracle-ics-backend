import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard — sets req.user if a valid token is present,
 * but never throws if the token is absent or invalid.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Override handleRequest so missing/invalid tokens are silently ignored
  handleRequest(_err: any, user: any) {
    return user || null;
  }
}
