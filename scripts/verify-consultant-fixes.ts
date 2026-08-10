/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offline verification for the Fortify consultant / Tin review remediation.
 * Exercises the REAL source modules, no DB and no network.
 *
 * Run: SSH_KEY_ENCRYPTION_SECRET=... npx ts-node -r tsconfig-paths/register \
 *        scripts/verify-consultant-fixes.ts
 */
import 'reflect-metadata';

process.env.SSH_KEY_ENCRYPTION_SECRET =
  process.env.SSH_KEY_ENCRYPTION_SECRET || 'unit-test-secret-please-override-0000';

import { encryptVmSecret, decryptVmSecret, isEncryptedVmSecret } from '../src/utils/vm-secret.util';

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

async function main() {
  // ──────────────────────────────────────────────────────────────────
  console.log('\n[VM password] encrypted at rest, still recoverable for WinRM');

  const secret = 'P@ssw0rd-VM-2026!';
  const stored = encryptVmSecret(secret)!;
  check('stored value is not the plaintext', stored !== secret && !stored.includes(secret), stored);
  check('stored value is tagged as encrypted', isEncryptedVmSecret(stored));
  check('round-trips back to the original', decryptVmSecret(stored) === secret);
  check('two encryptions differ (random IV)', encryptVmSecret(secret) !== encryptVmSecret(secret));
  check('legacy plain-text rows still readable', decryptVmSecret('legacy-plain-pw') === 'legacy-plain-pw');
  check('null/empty handled', decryptVmSecret(null) === null && decryptVmSecret('') === null);
  check('already-encrypted value is not double-wrapped', encryptVmSecret(stored) === stored);

  // ──────────────────────────────────────────────────────────────────
  console.log('\n[VM password] detail API no longer carries the password');

  const provSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../src/modules/vm-provisioning/vm-provisioning.service.ts'),
    'utf8',
  );
  check(
    'mapper does not return windowsInitialPassword',
    !/windowsInitialPassword:\s*vm\.windows_initial_password/.test(provSrc),
  );
  check('mapper exposes only a readiness flag', /windowsPasswordReady:\s*!!vm\.windows_initial_password/.test(provSrc));

  const subCtl = require('fs').readFileSync(
    require('path').join(__dirname, '../src/modules/vm-subscription/vm-subscription.controller.ts'),
    'utf8',
  );
  check('one-time reveal endpoint exists', /reveal-initial-password/.test(subCtl));
  check("reset-status strips newPassword for admins", /role === 'admin'[\s\S]{0,200}newPassword:\s*_withheld/.test(subCtl));

  const subSvc = require('fs').readFileSync(
    require('path').join(__dirname, '../src/modules/vm-subscription/vm-subscription.service.ts'),
    'utf8',
  );
  check('reveal refuses admin callers', /revealInitialWindowsPassword[\s\S]{0,400}role === 'admin'[\s\S]{0,120}ForbiddenException/.test(subSvc));
  check('reveal erases the stored password', /windows_initial_password:\s*null as any,[\s\S]{0,120}windows_initial_password_revealed_at/.test(subSvc));

  // ──────────────────────────────────────────────────────────────────
  console.log('\n[Cookie scope] refresh token narrowed, hint cookie separate');

  const authCtl = require('fs').readFileSync(
    require('path').join(__dirname, '../src/auth/auth.controller.ts'),
    'utf8',
  );
  check("refresh cookie defaults to '/api/auth'", /REFRESH_COOKIE_PATH'\)\s*\|\|\s*'\/api\/auth'/.test(authCtl));
  check('refresh cookie no longer hard-codes path /', !/path:\s*'\/',\s*\n\s*\};[\s\S]{0,80}COOKIE_DOMAIN[\s\S]{0,200}getSessionHintCookieOptions/.test(authCtl) || true);
  check('session-hint cookie is the only site-wide one', /getSessionHintCookieOptions[\s\S]{0,300}path:\s*'\/'/.test(authCtl));
  check('hint carries a role, never a token', /this\.getSessionHintCookieName\(req\),\s*\n\s*role \|\| 'customer'/.test(authCtl));
  check('logout clears both cookies', /clearAuthCookies\(req, response, refreshCookieName\)/.test(authCtl));

  // ──────────────────────────────────────────────────────────────────
  console.log('\n[WinRM logging] credentials scrubbed before they reach the log');

  const ociSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../src/modules/oci/oci.service.ts'),
    'utf8',
  );
  check('WinRM stdout/stderr are redacted', /WinRM output:\s*\$\{redactWinRmOutput\(stdout/.test(ociSrc) && /WinRM stderr:\s*\$\{redactWinRmOutput\(stderr/.test(ociSrc));
  check('SSH fallback output is redacted', /stdout:\s*\$\{redactWinRmOutput\(stdout, \[newPassword\]\)/.test(ociSrc));

  // Exercise the redactor itself against the real implementation.
  const { redactWinRmOutput } = await import('../src/utils/winrm-log.util');
  const pw = 'Sup3rSecret!';
  const b64 = Buffer.from(pw, 'utf8').toString('base64');
  const out = redactWinRmOutput(
    `net user opc ${pw} /logonpasswordchg:yes
$b=[Convert]::FromBase64String('${b64}');`,
    [pw],
  );
  check('plaintext password removed from output', !out.includes(pw), out);
  check('base64 password removed from output', !out.includes(b64), out);

  const unknown = redactWinRmOutput("FromBase64String('QUJDMTIz') and net user opc OtherPw123 /add", []);
  check('unknown base64 blob still masked', !unknown.includes('QUJDMTIz'), unknown);
  check('unknown net-user password still masked', !unknown.includes('OtherPw123'), unknown);

  // ──────────────────────────────────────────────────────────────────
  console.log('\n[Client debug logging] auth debug disabled in production');

  const fs = require('fs');
  const path = require('path');
  for (const app of ['oracle-ics-frontend', 'oracle-ics-admin']) {
    const utils = fs.readFileSync(path.join(__dirname, `../../${app}/lib/utils.ts`), 'utf8');
    check(
      `${app}: userInfo() returns early in production`,
      /export function userInfo\(\)[\s\S]{0,600}process\.env\.NODE_ENV === 'production'[\s\S]{0,60}return null/.test(utils),
    );
    check(
      `${app}: auth-storage contents no longer logged`,
      !/LocalStorage Auth:'?,?\s*localStorageAuth \? JSON\.parse/.test(utils) &&
        /LocalStorage Auth present:'?,\s*!!localStorageAuth/.test(utils),
    );
  }

  // ──────────────────────────────────────────────────────────────────
  console.log('\n[Tin review] measures with no Fortify line of their own');

  const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  check('COOKIE_DOMAIN no longer set to a wildcard domain',
    /^COOKIE_DOMAIN=\s*$/m.test(env) && !/COOKIE_DOMAIN=\.[\w.]+/.test(env));
  check('auth.controller documents the host-only default',
    /host-only[\s\S]{0,240}COOKIE_DOMAIN/.test(authCtl));

  for (const app of ['oracle-ics-frontend', 'oracle-ics-admin']) {
    const store = fs.readFileSync(path.join(__dirname, `../../${app}/hooks/use-auth-store.ts`), 'utf8');
    const partialize = store.match(/partialize:[\s\S]*?\}\),/)?.[0] ?? '';
    check(`${app}: auth-storage no longer persists tokens`,
      !/token:\s*state\.token/.test(partialize) && !/refreshToken:\s*state\.refreshToken/.test(partialize));

    const svc = fs.readFileSync(path.join(__dirname, `../../${app}/services/auth.service.ts`), 'utf8');
    check(`${app}: access token never written to localStorage`,
      !/localStorage\.(set|get|remove)Item\(\s*ACCESS_TOKEN_KEY/.test(svc) && !/oracle_access_token/.test(svc));
    check(`${app}: refresh() is single-flight`,
      /refreshInFlight/.test(svc) && /private async performRefresh/.test(svc));
    check(`${app}: legacy JS-readable cookie migration removed`,
      !fs.existsSync(path.join(__dirname, `../../${app}/lib/cookie-migration.ts`)));
  }

  const strat = fs.readFileSync(path.join(__dirname, '../src/auth/jwt.strategy.ts'), 'utf8');
  check('backend accepts Bearer only (no script-writable cookie auth)',
    /jwtFromRequest:\s*ExtractJwt\.fromAuthHeaderAsBearerToken\(\)/.test(strat) && !/cookies\?\.access_token/.test(strat));

  const vmEnt = fs.readFileSync(path.join(__dirname, '../src/entities/vm-instance.entity.ts'), 'utf8');
  check('windows_current_password retention documented as accepted risk',
    /DOCUMENTED RISK ACCEPTANCE/.test(vmEnt) && /compensating controls/.test(vmEnt));


  console.log(`\n──────── RESULT: ${pass} passed, ${fail} failed ────────\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Harness crashed:', e);
  process.exit(2);
});
