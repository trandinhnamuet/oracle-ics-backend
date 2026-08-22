import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    const primaryEmail = emails?.[0];
    if (!primaryEmail?.value) {
      return done(new UnauthorizedException('Tài khoản Google không cung cấp email.'), undefined);
    }

    // Only trust a Google-verified email: account-linking keys off this address,
    // so an unverified (attacker-settable) email must not be able to link to a
    // pre-existing local account. passport exposes it as `verified` ('true'|'false').
    // Fail closed: link only when Google EXPLICITLY marks the email verified.
    // A missing/undefined flag must be rejected, not trusted (F5).
    const isVerified = (primaryEmail as { verified?: boolean | string }).verified;
    if (isVerified !== true && isVerified !== 'true') {
      return done(new UnauthorizedException('Email Google chưa được xác minh.'), undefined);
    }

    const user = {
      googleId: id,
      email: primaryEmail.value,
      firstName: name?.givenName || '',
      lastName: name?.familyName || '',
      picture: photos?.[0]?.value,
    };

    done(null, user);
  }
}
