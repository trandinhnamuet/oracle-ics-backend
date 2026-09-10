import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reshapes the 5 Starter tiers onto a flatter vCPU curve, at the customer's
 * explicit request (2026-09-10): 4 tiers now hold at 2 vCPU and only grow RAM
 * (1 / 2 / 4 / 6 GB), with the vCPU bump to 4 reserved for the top tier (8 GB
 * RAM) — instead of the old curve, which doubled vCPU alongside RAM
 * (2,2,4,4,8 vCPU for 1,2,4,8,8 GB RAM).
 *
 * Boot volume sizes (20/20/20/20/40 GB) were specified directly by the
 * customer, not derived — they chose to hold storage flat across the four
 * 2-vCPU tiers and only bump it at the 4-vCPU tier.
 *
 * PRICE follows the same burstable-OCPU formula already in use for every
 * other compute package (see 20260508100002's comment and the 2026-09-09
 * repricing): OCI E5.Flex vendor rates, no markup, burstable instances billed
 * at 50% baseline on the vCPU term only —
 *
 *     cost_usd = 0.5*(vCPU*0.0150*744) + RAM_GB*0.0020*744 + storage_GB*0.0425
 *     cost_vnd = cost_usd * 26310
 *
 * That formula reproduces Starter 1 and Starter 2's currently-live prices
 * exactly when their spec is unchanged (13.498 / 15.836 USD), which is the
 * cross-check that it's still the right formula and rate table to use here.
 *
 * The `name` (Starter 1..5) and `id` of each row are kept so existing
 * subscriptions/orders referencing these IDs are unaffected; only the spec
 * and price change.
 *
 * This migration only UPDATEs — it does not touch is_active, type, feature or
 * bandwidth (feature/bandwidth text is also normalized onto the same
 * "GB SSD Storage" / "Bandwidth Xmbps" format the other 4 rows already use;
 * Starter 1 alone had been stored as "20GB SSD" / "300Mbps", a cosmetic
 * leftover from an earlier edit with no effect on parsing, since
 * parsePackageNumericValue() just regexes for the first number either way).
 */
export class ResizeStarterPackages20260910100003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const updates: Array<[number, string, string, string, number, number]> = [
      // id,   cpu,       ram,       memory,               cost,      cost_vnd
      [1812, '2 vCPU', '1GB RAM', '20GB SSD Storage', 13.498000, 355132.380000],
      [2, '2 vCPU', '2GB RAM', '20GB SSD Storage', 14.986000, 394281.660000],
      [1790, '2 vCPU', '4GB RAM', '20GB SSD Storage', 17.962000, 472580.220000],
      [1791, '2 vCPU', '6GB RAM', '20GB SSD Storage', 20.938000, 550878.780000],
      [1792, '4 vCPU', '8GB RAM', '40GB SSD Storage', 35.924000, 945160.440000],
    ];
    for (const [id, cpu, ram, memory, cost, costVnd] of updates) {
      await queryRunner.query(
        `UPDATE oracle.cloud_packages
         SET cpu = $1, ram = $2, memory = $3, cost = $4, cost_vnd = $5,
             bandwidth = 'Bandwidth 300Mbps', updated_at = now()
         WHERE id = $6 AND type = 'starter'`,
        [cpu, ram, memory, cost, costVnd, id],
      );
    }
    console.log('Starter packages resized: 2/2/2/2/4 vCPU with 1/2/4/6/8 GB RAM, 20/20/20/20/40 GB storage');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the exact values that were live in production immediately before
    // this migration (verified 2026-09-10), not any other historical variant.
    const restores: Array<[number, string, string, string, string, number, number]> = [
      [1812, '2 vCPU', '1GB RAM', '20GB SSD', '300Mbps', 13.498000, 355132.380000],
      [2, '2 vCPU', '2GB RAM', '40GB SSD Storage', 'Bandwidth 300Mbps', 15.836000, 416645.160000],
      [1790, '4 vCPU', '4GB RAM', '80GB SSD Storage', 'Bandwidth 300Mbps', 31.672000, 833290.320000],
      [1791, '4 vCPU', '8GB RAM', '80GB SSD Storage', 'Bandwidth 300Mbps', 37.624000, 989887.440000],
      [1792, '8 vCPU', '8GB RAM', '100GB SSD Storage', 'Bandwidth 300Mbps', 60.794000, 1599490.140000],
    ];
    for (const [id, cpu, ram, memory, bandwidth, cost, costVnd] of restores) {
      await queryRunner.query(
        `UPDATE oracle.cloud_packages
         SET cpu = $1, ram = $2, memory = $3, bandwidth = $4, cost = $5, cost_vnd = $6, updated_at = now()
         WHERE id = $7 AND type = 'starter'`,
        [cpu, ram, memory, bandwidth, cost, costVnd, id],
      );
    }
  }
}
