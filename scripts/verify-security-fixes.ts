/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offline verification of the security fixes — exercises the REAL source
 * classes (DTOs, User entity, AuthService methods) without touching the DB.
 * Run: npx ts-node -r tsconfig-paths/register scripts/verify-security-fixes.ts
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance, instanceToPlain } from 'class-transformer';

import { CreateCloudPackageDto } from '../src/modules/cloud-package/dto/create-cloud-package.dto';
import { CreatePaymentDto } from '../src/modules/payment/dto/create-payment.dto';
import { CreateUserWalletDto } from '../src/modules/user-wallet/dto/create-user-wallet.dto';
import { CreateSubscriptionDto } from '../src/modules/subscription/dto/create-subscription.dto';
import { User } from '../src/entities/user.entity';
import { AuthService } from '../src/auth/auth.service';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}   ${detail}`);
  }
}

async function hasErrorOn(obj: any, field: string): Promise<boolean> {
  const errs = await validate(obj);
  return errs.some((e) => e.property === field);
}

async function main() {
  // ────────────────────────────────────────────────────────────────────
  console.log('\n#5 — Negative/invalid numeric input is rejected, valid input still accepted');

  const badPkg = plainToInstance(CreateCloudPackageDto, { name: 'X', cost: -5, cost_vnd: -100 });
  check('cloud-package: negative cost rejected', await hasErrorOn(badPkg, 'cost'));
  check('cloud-package: negative cost_vnd rejected', await hasErrorOn(badPkg, 'cost_vnd'));

  const goodPkg = plainToInstance(CreateCloudPackageDto, { name: 'X', cost: 10, cost_vnd: 250000 });
  check('cloud-package: valid positive price ACCEPTED (no regression)',
    !(await hasErrorOn(goodPkg, 'cost')) && !(await hasErrorOn(goodPkg, 'cost_vnd')));

  const badPay = plainToInstance(CreatePaymentDto, { payment_method: 'sepay', payment_type: 'deposit', amount: -1000 });
  check('payment: negative amount (Add Funds abuse) rejected', await hasErrorOn(badPay, 'amount'));
  const goodPay = plainToInstance(CreatePaymentDto, { payment_method: 'sepay', payment_type: 'deposit', amount: 50000 });
  check('payment: valid positive deposit ACCEPTED (no regression)', !(await hasErrorOn(goodPay, 'amount')));

  const badWallet = plainToInstance(CreateUserWalletDto, { user_id: 1, balance: -1 });
  check('wallet: negative balance rejected', await hasErrorOn(badWallet, 'balance'));

  const badSub = plainToInstance(CreateSubscriptionDto, { user_id: 1, cloud_package_id: 1, amount_paid: -1, months_paid: 0 });
  check('subscription: negative amount_paid rejected', await hasErrorOn(badSub, 'amount_paid'));
  check('subscription: months_paid < 1 rejected', await hasErrorOn(badSub, 'months_paid'));
  const goodSub = plainToInstance(CreateSubscriptionDto, { user_id: 1, cloud_package_id: 1, amount_paid: 100, months_paid: 3 });
  check('subscription: valid values ACCEPTED (no regression)',
    !(await hasErrorOn(goodSub, 'amount_paid')) && !(await hasErrorOn(goodSub, 'months_paid')));

  // ────────────────────────────────────────────────────────────────────
  console.log('\n#2 — Sensitive User fields are stripped from serialized output');

  const u = new User();
  u.id = 7;
  u.email = 'alice@example.com';
  u.firstName = 'Alice';
  u.lastName = 'Nguyen';
  (u as any).password = '$2a$12$hashsecret';
  (u as any).refreshToken = 'rt-secret';
  (u as any).emailVerificationOtp = '123456';
  (u as any).passwordResetOtp = '654321';

  const plain: any = instanceToPlain(u);
  check('password removed from response', plain.password === undefined, `got: ${plain.password}`);
  check('refreshToken removed', plain.refreshToken === undefined);
  check('emailVerificationOtp removed', plain.emailVerificationOtp === undefined);
  check('passwordResetOtp removed', plain.passwordResetOtp === undefined);
  check('non-sensitive fields retained (email/firstName)', plain.email === 'alice@example.com' && plain.firstName === 'Alice');

  // Nested: a related User inside another object is also stripped (mirrors how
  // Payment/Subscription/etc. return `user` via a relation). ClassSerializer
  // recurses into nested class instances.
  const wrapper: any = { id: 'pay_1', amount: 999, user: u };
  const wrapperPlain: any = instanceToPlain(wrapper);
  check('nested relation user.password stripped', wrapperPlain.user?.password === undefined, JSON.stringify(wrapperPlain.user));

  // ────────────────────────────────────────────────────────────────────
  console.log('\n#7 — extractIpAddress ignores client-controlled headers (real method)');

  const svc: any = Object.create(AuthService.prototype);
  svc.logger = { debug() {}, log() {}, warn() {}, error() {} };

  const spoofed = {
    headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9', 'cf-connecting-ip': '8.8.8.8' },
    ip: '10.0.0.42',
    socket: { remoteAddress: '10.0.0.42' },
  };
  const r1 = svc.extractIpAddress(spoofed);
  check('spoofed X-Forwarded-For/X-Real-IP/CF ignored → uses request.ip', r1.ipV4 === '10.0.0.42', JSON.stringify(r1));
  check('forged header value never becomes the resolved IP', r1.ipV4 !== '1.2.3.4' && r1.ipV6 !== '1.2.3.4');

  const mapped = { headers: {}, ip: '::ffff:203.0.113.5', socket: { remoteAddress: '::ffff:203.0.113.5' } };
  const r2 = svc.extractIpAddress(mapped);
  check('IPv4-mapped IPv6 normalized to IPv4', r2.ipV4 === '203.0.113.5', JSON.stringify(r2));

  // ────────────────────────────────────────────────────────────────────
  console.log('\n#6 — Access token carries a session id; session check gates validity (real methods)');

  const { JwtService } = await import('@nestjs/jwt');
  svc.jwtService = new JwtService({ secret: 'test-secret-for-verification' });
  svc.configService = { get: () => 'test-refresh-secret' };

  const user = new User();
  user.id = 42;
  user.email = 'bob@example.com';
  user.role = 'customer';
  const tokens = svc.generateTokens(user, 'SID-ABC-123');
  const decoded: any = svc.jwtService.decode(tokens.accessToken);
  check('access token embeds sid claim', decoded?.sid === 'SID-ABC-123', JSON.stringify(decoded));

  // isSessionActive against a stubbed repository (no DB): present → true, missing → false, expired → false
  svc.deleteSession = async () => {};
  const future = new Date(Date.now() + 3600_000);
  const past = new Date(Date.now() - 3600_000);
  const rows: Record<string, any> = {
    live: { id: 'live', expiresAt: future },
    dead: { id: 'dead', expiresAt: past },
  };
  svc.sessionRepository = { findOne: async ({ where }: any) => rows[where.id] ?? null };
  check('isSessionActive(existing, not expired) → true', (await svc.isSessionActive('live')) === true);
  check('isSessionActive(deleted/logged-out session) → false', (await svc.isSessionActive('missing')) === false);
  check('isSessionActive(expired session) → false', (await svc.isSessionActive('dead')) === false);
  check('isSessionActive(no sid / legacy token) → false', (await svc.isSessionActive(undefined)) === false);

  // ────────────────────────────────────────────────────────────────────
  console.log(`\n──────── RESULT: ${pass} passed, ${fail} failed ────────\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Harness crashed:', e);
  process.exit(2);
});
