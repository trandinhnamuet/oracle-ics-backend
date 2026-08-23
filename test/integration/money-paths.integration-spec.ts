/**
 * Integration tests for the money paths — the exact scenarios that produced
 * CRITICAL/HIGH bugs across security-scan rounds 4–6:
 *   - auto-renewal cron charging (the CRITICAL that no-op'd renewals)
 *   - manualRenew concurrent double-charge (CAS)
 *   - wallet debit atomicity / overdraft
 *   - createWithAccountBalance all-or-nothing transaction
 *   - sepay webhook: deposit, subscription activation, overpayment, M-S2 reconcile,
 *     underpayment, and bankTx idempotency
 *
 * Run: `npm run test:integration` with DB_* env vars exported (on the sandbox).
 */
import { DataSource } from 'typeorm';
import {
  buildMoneyTestModule, cleanupTestData, seedUserWithWallet, seedSubscription,
  getBalance, getSubStatus, countTxns, MoneyTestCtx,
} from './money.setup';
import { NotificationType } from '../../src/entities/notification.entity';

// Package 1812 = "Starter 1", 2 vCPU, cost_vnd 648751.98. Windows uplift for 1 OCPU
// = ceil(2/2) * 0.092 * 744 * 26310 = 1,800,867 -> Windows monthly = 2,449,618.98.
const PKG = 1812;
const LINUX_COST = 648751.98;
const WINDOWS_COST = 2449618.98;

jest.setTimeout(120000);

describe('Money paths (integration, real Postgres)', () => {
  let ctx: MoneyTestCtx;
  let ds: DataSource;

  beforeAll(async () => {
    ctx = await buildMoneyTestModule();
    ds = ctx.dataSource;
  });

  afterAll(async () => {
    if (ds) {
      await cleanupTestData(ds);
      await ctx.moduleRef.close();
    }
  });

  beforeEach(async () => {
    await cleanupTestData(ds);
    ctx.notify.mockClear();
  });

  // ---------------------------------------------------------------- wallet atomicity
  describe('UserWalletService', () => {
    it('rejects an overdraft', async () => {
      const { userId } = await seedUserWithWallet(ds, 100000);
      await expect(ctx.userWalletService.deductBalance(userId, 200000)).rejects.toThrow();
      expect(await getBalance(ds, userId)).toBe(100000);
    });

    it('deductBalanceTx rejects a non-positive amount', async () => {
      const { userId } = await seedUserWithWallet(ds, 100000);
      await expect(
        ds.transaction((m) => ctx.userWalletService.deductBalanceTx(m, userId, 0)),
      ).rejects.toThrow();
      await expect(
        ds.transaction((m) => ctx.userWalletService.deductBalanceTx(m, userId, -50)),
      ).rejects.toThrow();
    });

    it('serializes concurrent deductions (no oversell)', async () => {
      const { userId } = await seedUserWithWallet(ds, 100000);
      const results = await Promise.allSettled([
        ctx.userWalletService.deductBalance(userId, 80000),
        ctx.userWalletService.deductBalance(userId, 80000),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      expect(ok).toBe(1); // only one 80k deduction can succeed against a 100k balance
      expect(await getBalance(ds, userId)).toBe(20000);
    });
  });

  // ---------------------------------------------------------------- manual renewal
  describe('manualRenew', () => {
    it('charges base + Windows uplift and advances the subscription', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'expired', osType: 'windows', endOffsetDays: -2 });
      await ctx.subscriptionService.manualRenew(subId, userId);
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - WINDOWS_COST, 2);
      const sub = await getSubStatus(ds, subId);
      expect(sub!.status).toBe('active');
      expect(new Date(sub!.end_date).getTime()).toBeGreaterThan(Date.now());
      expect(await countTxns(ds, walletId, 'manual_renewal')).toBe(1);
    });

    it('does NOT double-charge under concurrent renewals', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'expired', osType: 'linux', endOffsetDays: -2 });
      const results = await Promise.allSettled([
        ctx.subscriptionService.manualRenew(subId, userId),
        ctx.subscriptionService.manualRenew(subId, userId),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - LINUX_COST, 2);
      expect(await countTxns(ds, walletId, 'manual_renewal')).toBe(1);
    });

    it('rejects renewing a non-expired subscription', async () => {
      const { userId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'active', endOffsetDays: 10 });
      await expect(ctx.subscriptionService.manualRenew(subId, userId)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------- auto-renewal CRON (the CRITICAL)
  describe('checkExpiredSubscriptions (auto-renewal cron)', () => {
    it('renews an ACTIVE overdue auto-renew subscription (the round-6 CRITICAL)', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'active', osType: 'windows', autoRenew: true, endOffsetDays: -2 });
      await ctx.subscriptionService.checkExpiredSubscriptions();
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - WINDOWS_COST, 2);
      const sub = await getSubStatus(ds, subId);
      expect(sub!.status).toBe('active');
      expect(new Date(sub!.end_date).getTime()).toBeGreaterThan(Date.now());
      expect(await countTxns(ds, walletId, 'auto_renewal')).toBe(1);
    });

    it('expires (does not charge) an overdue auto-renew sub with insufficient balance', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 1000);
      const subId = await seedSubscription(ds, userId, { status: 'active', osType: 'linux', autoRenew: true, endOffsetDays: -2 });
      await ctx.subscriptionService.checkExpiredSubscriptions();
      expect(await getBalance(ds, userId)).toBe(1000);
      expect((await getSubStatus(ds, subId))!.status).toBe('expired');
      expect(await countTxns(ds, walletId, 'auto_renewal')).toBe(0);
    });

    it('notifies SUBSCRIPTION_EXPIRED exactly once across repeated cron runs (R8-F1 spam regression)', async () => {
      // Underfunded auto-renew sub: day 1 transitions active->expired (one notice); the
      // sub stays expired+auto_renew and is re-selected on every later cron run. The bug
      // was that the mark-expired UPDATE guarded on status IN (active,expired), so Postgres
      // counted the no-op SET on an already-expired row as affected -> the "plan expired"
      // notification fired again every single day. Fixed to guard status='active' only.
      const { userId } = await seedUserWithWallet(ds, 1000);
      const subId = await seedSubscription(ds, userId, { status: 'active', osType: 'linux', autoRenew: true, endOffsetDays: -2 });
      ctx.notify.mockClear();
      await ctx.subscriptionService.checkExpiredSubscriptions();
      expect((await getSubStatus(ds, subId))!.status).toBe('expired');
      // Two more daily ticks — still underfunded, already expired.
      await ctx.subscriptionService.checkExpiredSubscriptions();
      await ctx.subscriptionService.checkExpiredSubscriptions();
      const expiredNotices = ctx.notify.mock.calls.filter(
        (c: any[]) => c[1] === NotificationType.SUBSCRIPTION_EXPIRED,
      );
      expect(expiredNotices.length).toBe(1);
    });

    it('expires an overdue sub without auto-renew', async () => {
      const { userId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'active', autoRenew: false, endOffsetDays: -2 });
      await ctx.subscriptionService.checkExpiredSubscriptions();
      expect((await getSubStatus(ds, subId))!.status).toBe('expired');
    });

    it('leaves a not-yet-overdue subscription untouched', async () => {
      const { userId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'active', autoRenew: true, endOffsetDays: 10 });
      const before = (await getSubStatus(ds, subId))!.end_date;
      await ctx.subscriptionService.checkExpiredSubscriptions();
      const after = await getSubStatus(ds, subId);
      expect(after!.status).toBe('active');
      expect(new Date(after!.end_date).getTime()).toBe(new Date(before).getTime());
    });

    it('does NOT auto-renew a suspended subscription (candidate-query exclusion)', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'suspended', autoRenew: true, endOffsetDays: -2 });
      await ctx.subscriptionService.checkExpiredSubscriptions();
      expect((await getSubStatus(ds, subId))!.status).toBe('suspended');
      expect(await getBalance(ds, userId)).toBe(50000000);
      expect(await countTxns(ds, walletId, 'auto_renewal')).toBe(0);
    });

    it('charges a DEEPLY-lapsed sub exactly once and dates it ~now+1mo (not prevEnd+1mo)', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const subId = await seedSubscription(ds, userId, { status: 'active', osType: 'linux', autoRenew: true, endOffsetDays: -90 });
      await ctx.subscriptionService.checkExpiredSubscriptions();
      // Exactly ONE charge, not one-per-lapsed-month.
      expect(await countTxns(ds, walletId, 'auto_renewal')).toBe(1);
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - LINUX_COST, 2);
      const sub = await getSubStatus(ds, subId);
      // end_date must be ~1 month from NOW (H2 max(prevEnd,now)); the buggy prevEnd+1mo
      // for a 90-day lapse would land in the PAST.
      const end = new Date(sub!.end_date).getTime();
      expect(end).toBeGreaterThan(Date.now());
      expect(end).toBeLessThan(Date.now() + 40 * 24 * 3600 * 1000);
    });

    it('charges once when two cron instances run concurrently on the same overdue sub (CAS)', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      await seedSubscription(ds, userId, { status: 'active', osType: 'linux', autoRenew: true, endOffsetDays: -2 });
      // A second module = a second SubscriptionService instance with its own
      // isRenewalRunning flag, simulating horizontal scaling. The end_date<=now CAS must
      // still serialize them to a single charge.
      const ctx2 = await buildMoneyTestModule();
      try {
        await Promise.all([
          ctx.subscriptionService.checkExpiredSubscriptions(),
          ctx2.subscriptionService.checkExpiredSubscriptions(),
        ]);
      } finally {
        await ctx2.moduleRef.close();
      }
      expect(await countTxns(ds, walletId, 'auto_renewal')).toBe(1);
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - LINUX_COST, 2);
    });
  });

  // ---------------------------------------------------------------- subscribe (account balance)
  describe('createWithAccountBalance', () => {
    it('debits + creates the subscription + ledger atomically', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 50000000);
      const sub = await ctx.subscriptionService.createWithAccountBalance(userId, PKG, 1, false, 'windows');
      expect(sub.status).toBe('active');
      expect(await getBalance(ds, userId)).toBeCloseTo(50000000 - WINDOWS_COST, 2);
      expect(await countTxns(ds, walletId, 'subscription_payment')).toBe(1);
    });

    it('throws and does NOT debit on insufficient balance', async () => {
      const { userId } = await seedUserWithWallet(ds, 1000);
      await expect(ctx.subscriptionService.createWithAccountBalance(userId, PKG, 1, false, 'linux')).rejects.toThrow();
      expect(await getBalance(ds, userId)).toBe(1000);
      const subs = await ds.query(`SELECT count(*)::int c FROM oracle.subscriptions WHERE user_id=$1`, [userId]);
      expect(subs[0].c).toBe(0);
    });

    it('rejects a non-integer monthsCount', async () => {
      const { userId } = await seedUserWithWallet(ds, 50000000);
      await expect(ctx.subscriptionService.createWithAccountBalance(userId, PKG, 1.5 as any, false, 'linux')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------- sepay webhook
  describe('SepayService.handleWebhook', () => {
    const webhook = (content: string, amount: number, bankId: number) => ({
      id: bankId, gateway: 'TEST', transactionDate: '2026-08-21 00:00:00', accountNumber: '0',
      content, transferType: 'in', description: 't', transferAmount: amount, accumulated: amount,
    });

    async function seedPayment(userId: number, type: string, amount: number, code: string, subId?: string) {
      await ds.query(
        `INSERT INTO oracle.payments(id,user_id,amount,subscription_id,cloud_package_id,payment_method,payment_type,transaction_code,status,created_at,updated_at)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,'sepay_qr',$5,$6,'pending',now(),now())`,
        [userId, amount, subId ?? null, PKG, type, code],
      );
    }
    let bank = Date.now() * 10;

    it('credits a deposit to the wallet', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 0);
      const code = 'PAYIT' + (bank);
      await seedPayment(userId, 'deposit', 50000, code);
      const res = await ctx.sepayService.handleWebhook(webhook(code, 50000, ++bank));
      expect(res.success).toBe(true);
      expect(await getBalance(ds, userId)).toBe(50000);
      expect(await countTxns(ds, walletId, 'deposit')).toBe(1);
    });

    it('activates a pending subscription and records the net-zero stat pair', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 0);
      const subId = await seedSubscription(ds, userId, { status: 'pending', endOffsetDays: 30 });
      const code = 'SUBIT' + (++bank);
      await seedPayment(userId, 'subscription', 100000, code, subId);
      await ctx.sepayService.handleWebhook(webhook(code, 100000, ++bank));
      expect((await getSubStatus(ds, subId))!.status).toBe('active');
      expect(await getBalance(ds, userId)).toBe(0); // money went to the bank, not the wallet
      expect(await countTxns(ds, walletId, 'qr_payment_received')).toBe(1);
      expect(await countTxns(ds, walletId, 'qr_subscription_payment')).toBe(1);
    });

    it('credits the excess to the wallet on overpayment', async () => {
      const { userId } = await seedUserWithWallet(ds, 0);
      const subId = await seedSubscription(ds, userId, { status: 'pending', endOffsetDays: 30 });
      const code = 'SUBIT' + (++bank);
      await seedPayment(userId, 'subscription', 100000, code, subId);
      await ctx.sepayService.handleWebhook(webhook(code, 120000, ++bank));
      expect((await getSubStatus(ds, subId))!.status).toBe('active');
      expect(await getBalance(ds, userId)).toBe(20000);
    });

    it('reconciles a transfer to the wallet when the subscription is gone (M-S2)', async () => {
      const { userId, walletId } = await seedUserWithWallet(ds, 0);
      const subId = await seedSubscription(ds, userId, { status: 'pending', endOffsetDays: 30 });
      const code = 'SUBIT' + (++bank);
      await seedPayment(userId, 'subscription', 100000, code, subId);
      await ds.query(`DELETE FROM oracle.subscriptions WHERE id=$1`, [subId]); // simulate auto-deletion
      await ctx.sepayService.handleWebhook(webhook(code, 100000, ++bank));
      expect(await getBalance(ds, userId)).toBe(100000);
      expect(await countTxns(ds, walletId, 'deposit')).toBe(1);
    });

    it('credits an underpayment to the wallet and keeps the payment pending', async () => {
      const { userId } = await seedUserWithWallet(ds, 0);
      const subId = await seedSubscription(ds, userId, { status: 'pending', endOffsetDays: 30 });
      const code = 'SUBIT' + (++bank);
      await seedPayment(userId, 'subscription', 100000, code, subId);
      await ctx.sepayService.handleWebhook(webhook(code, 40000, ++bank));
      expect(await getBalance(ds, userId)).toBe(40000);
      expect((await getSubStatus(ds, subId))!.status).toBe('pending');
      const [p] = await ds.query(`SELECT status FROM oracle.payments WHERE transaction_code=$1`, [code]);
      expect(p.status).toBe('pending');
    });

    it('is idempotent — a duplicate bank transaction credits only once', async () => {
      const { userId } = await seedUserWithWallet(ds, 0);
      const code = 'PAYIT' + (++bank);
      await seedPayment(userId, 'deposit', 50000, code);
      const dupBankId = ++bank;
      await ctx.sepayService.handleWebhook(webhook(code, 50000, dupBankId));
      await ctx.sepayService.handleWebhook(webhook(code, 50000, dupBankId)); // same bank tx id
      expect(await getBalance(ds, userId)).toBe(50000); // credited once, not twice
    });
  });
});
