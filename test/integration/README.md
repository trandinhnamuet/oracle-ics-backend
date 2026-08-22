# Money-path integration tests

These tests guard the **money paths** (wallet, subscription, payment, sepay webhook) —
the exact code that produced CRITICAL/HIGH regressions in security-scan rounds 4–6
(auto-renewal charging, concurrent double-charge, transaction atomicity, sepay
idempotency/reconciliation, OTP handling).

## Why they hit a real database

Every one of those bugs lived in **DB semantics** — `dataSource.transaction`
rollbacks, compare-and-set `affected` counts, pessimistic row locks, and TypeORM
`save()` silently skipping `undefined` columns. Mocked-repository unit tests would
pass while the real behavior was broken, so this suite runs against a real Postgres.
External side-effecting services (OCI, notifications, bandwidth) are mocked.

## Running

Not part of `npm test` (that only matches `*.spec.ts`, so local dev needs no DB).
Run against a host that can reach the DB, with the `DB_*` env vars exported:

```bash
# on the sandbox (Postgres is on localhost there):
cd /root/web/oracle-ics-backend
set -a; . <(grep -E '^DB_' .env); set +a
npm run test:integration
```

`--runInBand` is used (the tests share one DB; parallel workers would clash on cleanup).

## Isolation & safety

- All test rows are namespaced by e-mail (`itest-*@integration.test`).
- `cleanupTestData` wipes them **before every test** and **after the suite**, so a
  crashed run never leaves residue and the suite never touches real rows.
- Cloud package `1812` ("Starter 1", 2 vCPU) is read-only reference data used for the
  known price maths (Linux 648 751.98 ₫; Windows +uplift = 2 449 618.98 ₫).

## CI recommendation

`oracle_user` cannot `CREATE DATABASE`, so this suite currently runs against the shared
`oracle_db` with namespaced/cleaned rows. For CI, provision a **dedicated throwaway
Postgres** (a container, or a `*_test` database) and point the `DB_*` env vars at it —
no code change needed. Then wire `npm run test:integration` into the pipeline so every
change to the money paths is covered automatically.
