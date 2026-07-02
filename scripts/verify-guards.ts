/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { AdminGuard } from '../src/auth/admin.guard';
import { CustomPackageRegistrationController } from '../src/custom-package-registration/custom-package-registration.controller';
import { SubscriptionController } from '../src/modules/subscription/subscription.controller';
import { CloudPackageController } from '../src/modules/cloud-package/cloud-package.controller';
import { OciController } from '../src/modules/oci/oci.controller';

let pass = 0, fail = 0;

// Guards attached via @UseGuards live under the '__guards__' metadata key on the
// method (or the class for controller-level guards).
function guardsOf(ctrl: any, method: string): any[] {
  const cls = Reflect.getMetadata('__guards__', ctrl) || [];
  const m = Reflect.getMetadata('__guards__', ctrl.prototype[method]) || [];
  return [...cls, ...m];
}
function has(ctrl: any, method: string, guard: any): boolean {
  return guardsOf(ctrl, method).some((g) => g === guard);
}
function expect(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

console.log('\n#1/#3 — Guard metadata on flagged routes (real controllers)');

// custom-package-registrations: POST public; the rest admin-only
expect('custom-package POST create is PUBLIC (no guards)', guardsOf(CustomPackageRegistrationController, 'create').length === 0);
for (const m of ['findAll', 'findOne', 'update', 'remove']) {
  expect(`custom-package ${m} → Jwt+Admin`,
    has(CustomPackageRegistrationController, m, JwtAuthGuard) && has(CustomPackageRegistrationController, m, AdminGuard));
}

// subscriptions: raw create admin-only (#3), admin list admin-only (#1)
expect('subscription create (raw, bypasses billing) → Jwt+Admin (#3)',
  has(SubscriptionController, 'create', JwtAuthGuard) && has(SubscriptionController, 'create', AdminGuard));
expect('subscription findAll (all users) → Jwt+Admin (#1)',
  has(SubscriptionController, 'findAll', JwtAuthGuard) && has(SubscriptionController, 'findAll', AdminGuard));
// regression: customer self-service routes still only need JwtAuthGuard (not admin)
expect('subscription my-subscriptions still Jwt-only (no regression)',
  has(SubscriptionController, 'findMySubscriptions', JwtAuthGuard) && !has(SubscriptionController, 'findMySubscriptions', AdminGuard));
expect('subscription subscribe-with-balance still Jwt-only (no regression)',
  has(SubscriptionController, 'subscribeWithBalance', JwtAuthGuard) && !has(SubscriptionController, 'subscribeWithBalance', AdminGuard));

// cloud-packages: full list admin-only; active stays public
expect('cloud-package findAll → Jwt+Admin (#1)',
  has(CloudPackageController, 'findAll', JwtAuthGuard) && has(CloudPackageController, 'findAll', AdminGuard));
expect('cloud-package findActive stays PUBLIC (storefront, no regression)',
  guardsOf(CloudPackageController, 'findActive').length === 0);

// oci: compartments admin-only (class-level Jwt + method Admin)
expect('oci getCompartments → Jwt+Admin (#1)',
  has(OciController, 'getCompartments', JwtAuthGuard) && has(OciController, 'getCompartments', AdminGuard));
expect('oci deleteCompartment → Jwt+Admin',
  has(OciController, 'deleteCompartment', JwtAuthGuard) && has(OciController, 'deleteCompartment', AdminGuard));
// regression: customer provisioning routes keep class-level Jwt, no admin
expect('oci getComputeImages still Jwt-only (no regression)',
  has(OciController, 'getComputeImages', JwtAuthGuard) && !has(OciController, 'getComputeImages', AdminGuard));

console.log(`\n──────── RESULT: ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail === 0 ? 0 : 1);
