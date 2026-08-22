/**
 * Integration-test harness for the money paths (wallet / subscription / payment /
 * sepay). These run against a REAL Postgres (the sandbox DB) because every bug this
 * suite guards against lives in DB semantics — transactions, compare-and-set
 * `affected` counts, pessimistic locks, and TypeORM `save()` skipping `undefined`.
 * Mocked-repository unit tests would give false confidence.
 *
 * External side-effecting services (OCI, notifications, bandwidth) are mocked so the
 * tests exercise only the money logic. Test data is namespaced by e-mail
 * (`itest-*@integration.test`) and wiped before every test and after the suite, so a
 * crash can never leave residue and the suite never touches real rows.
 *
 * NOT run by `npm test` (that only matches `*.spec.ts`). Run with `npm run test:integration`
 * on a host that can reach the DB (the sandbox), with the DB_* env vars exported.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'path';

import { UserWalletService } from '../../src/modules/user-wallet/user-wallet.service';
import { SubscriptionService } from '../../src/modules/subscription/subscription.service';
import { PaymentService } from '../../src/modules/payment/payment.service';
import { SepayService } from '../../src/modules/sepay/sepay.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { OciService } from '../../src/modules/oci/oci.service';
import { BandwidthService } from '../../src/modules/bandwidth/bandwidth.service';

import { User } from '../../src/entities/user.entity';
import { UserWallet } from '../../src/entities/user-wallet.entity';
import { WalletTransaction } from '../../src/entities/wallet-transaction.entity';
import { Subscription } from '../../src/entities/subscription.entity';
import { CloudPackage } from '../../src/entities/cloud-package.entity';
import { Payment } from '../../src/entities/payment.entity';
import { VmInstance } from '../../src/entities/vm-instance.entity';
import { VmActionsLog } from '../../src/entities/vm-actions-log.entity';
import { ProcessedSepayTransaction } from '../../src/entities/processed-sepay-transaction.entity';

export const TEST_EMAIL_DOMAIN = '@integration.test';
export const TEST_EMAIL_LIKE = 'itest-%@integration.test';

// Load ALL entities via glob so every relation resolves (money entities relate to many).
const ENTITY_GLOB = path.join(__dirname, '../../src/**/*.entity{.ts,.js}');

export interface MoneyTestCtx {
  moduleRef: TestingModule;
  dataSource: DataSource;
  userWalletService: UserWalletService;
  subscriptionService: SubscriptionService;
  paymentService: PaymentService;
  sepayService: SepayService;
  notify: jest.Mock;
}

export async function buildMoneyTestModule(): Promise<MoneyTestCtx> {
  const notify = jest.fn().mockResolvedValue(undefined);
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        schema: 'oracle',
        entities: [ENTITY_GLOB],
        synchronize: false,
        logging: false,
      }),
      TypeOrmModule.forFeature([
        User, UserWallet, WalletTransaction, Subscription, CloudPackage,
        Payment, VmInstance, VmActionsLog, ProcessedSepayTransaction,
      ]),
    ],
    providers: [
      UserWalletService,
      SubscriptionService,
      PaymentService,
      SepayService,
      { provide: NotificationService, useValue: { notify } },
      {
        provide: OciService,
        useValue: {
          startInstance: jest.fn().mockResolvedValue(undefined),
          stopInstance: jest.fn().mockResolvedValue(undefined),
          terminateInstance: jest.fn().mockResolvedValue(undefined),
          listShapes: jest.fn().mockResolvedValue([]),
          getImage: jest.fn().mockResolvedValue(null),
        },
      },
      { provide: BandwidthService, useValue: { getVmBandwidth: jest.fn(), recordSnapshot: jest.fn() } },
    ],
  }).compile();

  const dataSource = moduleRef.get(DataSource);
  return {
    moduleRef,
    dataSource,
    userWalletService: moduleRef.get(UserWalletService),
    subscriptionService: moduleRef.get(SubscriptionService),
    paymentService: moduleRef.get(PaymentService),
    sepayService: moduleRef.get(SepayService),
    notify,
  };
}

/** Delete every row belonging to a test user (by the namespaced e-mail), FK-safe. */
export async function cleanupTestData(ds: DataSource): Promise<void> {
  const ids: Array<{ id: number }> = await ds.query(
    `SELECT id FROM oracle.users WHERE email LIKE $1`, [TEST_EMAIL_LIKE],
  );
  if (!ids.length) return;
  const userIds = ids.map((r) => r.id);
  await ds.query(
    `DELETE FROM oracle.processed_sepay_transactions WHERE payment_id IN (SELECT id FROM oracle.payments WHERE user_id = ANY($1))`, [userIds],
  );
  await ds.query(
    `DELETE FROM oracle.wallet_transactions WHERE wallet_id IN (SELECT id FROM oracle.user_wallets WHERE user_id = ANY($1))`, [userIds],
  );
  await ds.query(`DELETE FROM oracle.payments WHERE user_id = ANY($1)`, [userIds]);
  await ds.query(`DELETE FROM oracle.vm_instances WHERE user_id = ANY($1)`, [userIds]);
  await ds.query(`DELETE FROM oracle.subscriptions WHERE user_id = ANY($1)`, [userIds]);
  await ds.query(`DELETE FROM oracle.user_sessions WHERE "userId" = ANY($1)`, [userIds.map(String)]);
  await ds.query(`DELETE FROM oracle.user_wallets WHERE user_id = ANY($1)`, [userIds]);
  await ds.query(`DELETE FROM oracle.users WHERE id = ANY($1)`, [userIds]);
}

let seq = 0;
/** Create a test user + wallet with the given starting balance; returns their ids. */
export async function seedUserWithWallet(
  ds: DataSource,
  balance = 0,
): Promise<{ userId: number; walletId: number; email: string }> {
  const email = `itest-${Date.now()}-${seq++}${TEST_EMAIL_DOMAIN}`;
  const [u] = await ds.query(
    `INSERT INTO oracle.users(email,first_name,last_name,is_active,role,auth_provider,password,email_verification_otp_attempts,password_reset_otp_attempts,created_at,updated_at)
     VALUES ($1,'IT','User',true,'customer','local','x',0,0,now(),now()) RETURNING id`,
    [email],
  );
  const [w] = await ds.query(
    `INSERT INTO oracle.user_wallets(user_id,balance,currency,status,is_active,created_at,updated_at)
     VALUES ($1,$2,'VND','active',true,now(),now()) RETURNING id`,
    [u.id, balance],
  );
  return { userId: u.id, walletId: w.id, email };
}

/** Insert a subscription row for a test user; returns its uuid. */
export async function seedSubscription(
  ds: DataSource,
  userId: number,
  opts: { status: string; osType?: string; autoRenew?: boolean; endOffsetDays?: number; cloudPackageId?: number },
): Promise<string> {
  const osType = opts.osType ?? 'linux';
  const autoRenew = opts.autoRenew ?? false;
  const days = opts.endOffsetDays ?? 30;
  const pkg = opts.cloudPackageId ?? 1812;
  const [s] = await ds.query(
    `INSERT INTO oracle.subscriptions(id,user_id,cloud_package_id,start_date,end_date,status,os_type,auto_renew,amount_paid,months_paid,created_at,updated_at)
     VALUES (gen_random_uuid(),$1,$2, now() - interval '40 day', now() + ($3 || ' day')::interval, $4,$5,$6,0,1,now(),now()) RETURNING id`,
    [userId, pkg, days, opts.status, osType, autoRenew],
  );
  return s.id;
}

export async function getBalance(ds: DataSource, userId: number): Promise<number> {
  const [w] = await ds.query(`SELECT balance FROM oracle.user_wallets WHERE user_id=$1`, [userId]);
  return w ? parseFloat(w.balance) : NaN;
}

export async function getSubStatus(ds: DataSource, subId: string): Promise<{ status: string; end_date: Date } | null> {
  const [s] = await ds.query(`SELECT status, end_date FROM oracle.subscriptions WHERE id=$1`, [subId]);
  return s ?? null;
}

export async function countTxns(ds: DataSource, walletId: number, type?: string): Promise<number> {
  const q = type
    ? `SELECT count(*)::int AS c FROM oracle.wallet_transactions WHERE wallet_id=$1 AND type=$2`
    : `SELECT count(*)::int AS c FROM oracle.wallet_transactions WHERE wallet_id=$1`;
  const [r] = await ds.query(q, type ? [walletId, type] : [walletId]);
  return r.c;
}
