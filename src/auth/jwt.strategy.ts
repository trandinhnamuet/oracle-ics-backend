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
      // Bearer header only. There used to be a fallback that accepted an
      // `access_token` cookie, but nothing on the server ever set that cookie —
      // only client-side JavaScript did, so it could not be HttpOnly and served
      // as a script-writable authentication channel. Clients hold the access
      // token in memory and send it as a Bearer header; the refresh token stays
      // in its HttpOnly cookie and is used only by /auth/refresh.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      // Pin the signing algorithm. Defence-in-depth: tokens are HS256 today, and
      // pinning prevents an "alg" confusion attack if the verifier ever gains an
      // asymmetric key.
      algorithms: ['HS256'],
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
