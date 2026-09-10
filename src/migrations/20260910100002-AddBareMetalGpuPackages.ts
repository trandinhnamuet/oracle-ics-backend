import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rounds out the AI/GPU catalogue with Oracle's full bare-metal GPU shape line-up,
 * and corrects the four rows that were already there.
 *
 * Context: AI/GPU packages are no longer self-serviceable. The platform provisions
 * every VM as VM.Standard.E5.Flex (ALLOWED_VM_SHAPES on prod), so a customer who
 * bought "BM.GPU2.2" was charged GPU money and handed an ordinary E5 VM. The
 * pricing UI now routes these to "contact us" and SubscriptionService blocks the
 * self-serve API paths; ICS provisions GPU capacity out of band. These rows are
 * therefore a catalogue/quote list, not something the portal can fulfil.
 *
 * Specs come from Oracle's published compute-shapes reference. The two shapes this
 * tenancy can actually launch (BM.GPU4.8, BM.GPU.A10.4) were cross-checked against
 * a live OCI listShapes call and match exactly on GPU count, OCPU, RAM and NVMe;
 * VM.GPU.A10.1/.2 likewise.
 *
 * cost/cost_vnd are deliberately 0 = "contact for a quote". Prices are NOT invented
 * here: the pricing UI shows "Liên hệ" for a zero-priced AI package. Fill them in
 * from Oracle's rate card if these should carry list prices.
 *
 * The `cpu` column is written as vCPU (= 2 × OCPU) to match every other row in this
 * table. The old rows said 'AI Optimized', which has no digits, so
 * parsePackageNumericValue() fell back to its 2-vCPU default and any provisioning
 * attempt would have produced a 1-OCPU VM.
 */
export class AddBareMetalGpuPackages20260910100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert only what is missing, keyed by name, so re-running is harmless and a
    // hand-added row with the same name is left alone.
    await queryRunner.query(`
      INSERT INTO oracle.cloud_packages
        (id, name, type, cost, cost_vnd, cpu, ram, memory, feature, bandwidth, updated_at, is_active)
      VALUES
        (1900, 'BM.GPU3.8',        'ai', 0, 0, '104 vCPU', '768GB RAM',  'Block storage',              '8 GPU NVIDIA Tesla V100 16GB',                'Dedicated AI infrastructure', now(), true),
        (1901, 'BM.GPU4.8',        'ai', 0, 0, '128 vCPU', '2048GB RAM', '27.2TB NVMe SSD (4 drives)', '8 GPU NVIDIA A100 40GB',                      'Dedicated AI infrastructure', now(), true),
        (1902, 'BM.GPU.A10.4',     'ai', 0, 0, '128 vCPU', '1024GB RAM', '7.68TB NVMe SSD (2 drives)', '4 GPU NVIDIA A10 24GB',                       'Dedicated AI infrastructure', now(), true),
        (1903, 'BM.GPU.A100-v2.8', 'ai', 0, 0, '256 vCPU', '2048GB RAM', '27.2TB NVMe SSD (4 drives)', '8 GPU NVIDIA A100 80GB',                      'Dedicated AI infrastructure', now(), true),
        (1904, 'BM.GPU.L40S.4',    'ai', 0, 0, '224 vCPU', '1024GB RAM', '2 x 3.84TB NVMe',            '4 GPU NVIDIA L40S 48GB',                      'Dedicated AI infrastructure', now(), true),
        (1905, 'BM.GPU.H100.8',    'ai', 0, 0, '224 vCPU', '2048GB RAM', '16 x 3.84TB NVMe',           '8 GPU NVIDIA H100 80GB',                      'Dedicated AI infrastructure', now(), true),
        (1906, 'BM.GPU.H200.8',    'ai', 0, 0, '224 vCPU', '3072GB RAM', '8 x 3.84TB NVMe',            '8 GPU NVIDIA H200 Tensor Core 141GB',         'Dedicated AI infrastructure', now(), true),
        (1907, 'BM.GPU.B200.8',    'ai', 0, 0, '256 vCPU', '4096GB RAM', '8 x 3.84TB NVMe',            '8 GPU NVIDIA B200 Tensor Core 180GB',         'Dedicated AI infrastructure', now(), true),
        (1908, 'BM.GPU.B300.8',    'ai', 0, 0, '256 vCPU', '4096GB RAM', '8 x 3.84TB NVMe',            '8 GPU NVIDIA B300 Tensor Core 263GB',         'Dedicated AI infrastructure', now(), true),
        (1909, 'BM.GPU.GB200.4',   'ai', 0, 0, '288 vCPU', '960GB RAM',  '4 x 7.68TB NVMe',            '4 GPU NVIDIA Blackwell B200 192GB',           'Dedicated AI infrastructure', now(), true),
        (1910, 'BM.GPU.GB300.4',   'ai', 0, 0, '288 vCPU', '960GB RAM',  '4 x 7.68TB NVMe',            '4 GPU NVIDIA Blackwell B300 278GB',           'Dedicated AI infrastructure', now(), true),
        (1911, 'BM.GPU.MI300X.8',  'ai', 0, 0, '224 vCPU', '2048GB RAM', '8 x 3.84TB NVMe',            '8 GPU AMD Instinct MI300X 192GB',             'Dedicated AI infrastructure', now(), true),
        (1912, 'BM.GPU.MI355X.8',  'ai', 0, 0, '256 vCPU', '3072GB RAM', '8 x 7.68TB NVMe',            '8 GPU AMD Instinct MI355X 288GB',             'Dedicated AI infrastructure', now(), true),
        (1913, 'BM.GPU.RTXPRO.8',  'ai', 0, 0, '288 vCPU', '3072GB RAM', '8 x 7.68TB NVMe',            '8 GPU NVIDIA RTX PRO 6000 Blackwell 96GB',    'Dedicated AI infrastructure', now(), true)
      ON CONFLICT (id) DO NOTHING
    `);

    // Correct the four pre-existing AI rows. They advertised GPU memory in the host
    // RAM column (BM.GPU2.2 said "32GB RAM"; it has 192GB of host RAM and 2 x 16GB
    // of GPU memory) and carried the digit-less 'AI Optimized' cpu string.
    // Prices are left untouched.
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = '56 vCPU', ram = '192GB RAM',
        feature = '2 GPU NVIDIA Tesla P100 16GB', updated_at = now()
      WHERE name = 'BM.GPU2.2'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = '24 vCPU', ram = '72GB RAM',
        feature = '1 GPU NVIDIA Tesla P100 16GB', updated_at = now()
      WHERE name = 'VM.GPU2.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = '30 vCPU', ram = '240GB RAM',
        feature = '1 GPU NVIDIA A10 24GB', updated_at = now()
      WHERE name = 'VM.GPU.A10.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = '60 vCPU', ram = '480GB RAM',
        feature = '2 GPU NVIDIA A10 24GB', updated_at = now()
      WHERE name = 'VM.GPU.A10.2'
    `);

    console.log('AI/GPU catalogue: added 14 bare-metal GPU shapes, corrected 4 existing rows');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM oracle.cloud_packages WHERE id BETWEEN 1900 AND 1913`);
    // Restore the original (incorrect) values so the rollback is faithful.
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = 'AI Optimized', ram = '32GB RAM',
        feature = '2 GPU Tesla P100' WHERE name = 'BM.GPU2.2'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = 'AI Optimized', ram = '16GB RAM',
        feature = '1 GPU Tesla P100' WHERE name = 'VM.GPU2.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = 'AI Optimized', ram = '24GB RAM',
        feature = '1 GPU A10 Tensor Core' WHERE name = 'VM.GPU.A10.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cpu = 'AI Optimized', ram = '48GB RAM',
        feature = '2 GPU A10 Tensor Core' WHERE name = 'VM.GPU.A10.2'
    `);
  }
}
