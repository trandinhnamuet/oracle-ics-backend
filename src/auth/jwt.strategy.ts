import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => {
          // Fallback: try to get from cookies
          const token = request?.cookies?.access_token;
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    // Reject access tokens whose backing session no longer exists. A session is
    // removed on logout, logout-all, and refresh-token rotation, so this is what
    // makes an access token stop working the moment the user logs out
    // (WSTG-SESS-06 — Logout Functionality). Tokens minted before this claim
    // existed (no `sid`) are also rejected; clients transparently recover by
    // calling /auth/refresh, which issues a fresh session-bound token.
    const sessionActive = await this.authService.isSessionActive(payload?.sid);
    if (!sessionActive) {
      throw new UnauthorizedException('Session has been terminated. Please log in again.');
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
