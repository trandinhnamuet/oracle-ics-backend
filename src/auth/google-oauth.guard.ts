import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'crypto';

const STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000; // the round trip to Google takes seconds

/**
 * Google OAuth with CSRF protection on the authorization round trip.
 *
 * The flow previously carried no `state`, so an attacker could start an
 * authorization request with their own Google account and trick a victim's
 * browser into completing it — the victim ends up silently signed in as the
 * attacker (login CSRF), and anything they then do lands in the attacker's
 * account.
 *
 * `state` is bound to the browser rather than to server memory: a random value
 * is sent both as the `state` query parameter and as a short-lived HttpOnly
 * cookie. On the callback the two must match, so a request that did not
 * originate from this browser cannot be completed. This keeps the service
 * stateless — no session store is required.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  private isCallbackLeg(req: any): boolean {
    return String(req?.path || req?.url || '').includes('callback');
  }

  /**
   * Cookie scope for the state cookie. Kept in lockstep with the refresh cookie
   * (auth.controller getRefreshCookiePath/getCookieOptions): both must use the
   * same path/secure/domain, otherwise setting REFRESH_COOKIE_PATH='/auth' for
   * local backend-port testing would leave oauth_state at '/api/auth' and every
   * Google login would fail with "Invalid OAuth state".
   */
  private stateCookieOptions(includeMaxAge: boolean) {
    const options: any = {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: this.configService.get<string>('REFRESH_COOKIE_PATH') || '/api/auth',
    };
    if (includeMaxAge) options.maxAge = STATE_TTL_MS;
    const cookieDomain = this.configService.get('COOKIE_DOMAIN');
    if (cookieDomain) options.domain = cookieDomain;
    return options;
  }

  /** Outbound leg only: mint the state, remember it in a cookie, hand it to passport. */
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // The callback leg validates state in canActivate; re-minting here would set a
    // fresh cookie right after canActivate cleared it (wasted work + stray cookie).
    if (this.isCallbackLeg(req)) return {};

    const res = context.switchToHttp().getResponse();
    const state = randomBytes(32).toString('hex');
    res.cookie(STATE_COOKIE, state, this.stateCookieOptions(true));
    return { state };
  }

  /** Inbound leg: the returned state must match the cookie this browser holds. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    if (this.isCallbackLeg(req)) {
      const returned = String(req.query?.state || '');
      const expected = String(req.cookies?.[STATE_COOKIE] || '');
      if (!returned || !expected || !safeEqual(returned, expected)) {
        throw new UnauthorizedException('Invalid OAuth state');
      }
      // One-time use: clear it so a captured callback URL cannot be replayed.
      res.clearCookie(STATE_COOKIE, this.stateCookieOptions(false));
    }

    return (await super.canActivate(context)) as boolean;
  }
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
