import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rounds out the AI/GPU catalogue with Oracle's full bare-metal GPU line-up, and
 * corrects the four rows that were already there.
 *
 * Context: AI/GPU packages are no longer self-serviceable. The platform provisions
 * every VM as VM.Standard.E5.Flex (ALLOWED_VM_SHAPES on prod), so a customer who
 * bought "BM.GPU2.2" was charged GPU money and handed an ordinary E5 VM with 1 OCPU.
 * The pricing UI now routes these to "contact us" and SubscriptionService blocks the
 * self-serve API paths; ICS provisions GPU capacity out of band. These rows are a
 * catalogue/quote list, not something the portal can fulfil.
 *
 * SPECS come from Oracle's published compute-shapes reference. The four shapes this
 * tenancy can launch (BM.GPU4.8, BM.GPU.A10.4, VM.GPU.A10.1, VM.GPU.A10.2) were
 * cross-checked against a live OCI listShapes call and match exactly on GPU count,
 * OCPU, RAM and local NVMe.
 *
 * PRICES come from Oracle's public price-list API
 * (apexapps.oracle.com/pls/apex/cetools/api/v1/products/, pulled 2026-09-09) using
 * the same formula the existing GPU rows already encoded:
 *
 *     cost_usd = GPUs x usdPerGpuHour x 744h  +  1024GB x $0.0425/GB/mo
 *     cost_vnd = cost_usd x 26310
 *
 * That formula reproduces the three pre-existing rows to the cent
 * (BM.GPU2.2 $1940.72, VM.GPU2.1 $992.12, VM.GPU.A10.1 $1531.52), which is what
 * validates it. GPU shapes are billed per GPU-hour with the node's CPU/RAM included,
 * so there is no separate vCPU/RAM term — unlike the burstable E5 compute packages.
 * No markup, no VAT, consistent with the rest of the catalogue.
 *
 * The four old rows are repriced onto USD->VND = 26310 as well: they were still on an
 * older rate (~25360), and VM.GPU.A10.2 had been costed against 100GB of storage while
 * advertising 1024GB. Their `ram` column also carried GPU memory rather than host RAM
 * (BM.GPU2.2 said "32GB RAM"; the node has 192GB host RAM and 2 x 16GB of GPU memory).
 *
 * The `cpu` column is written as vCPU (= 2 x OCPU) to match every other row in this
 * table. The old rows said 'AI Optimized', which has no digits, so
 * parsePackageNumericValue() fell back to its 2-vCPU default — that is why a
 * 49M VND/month purchase provisioned a single OCPU.
 */
export class AddBareMetalGpuPackages20260910100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO oracle.cloud_packages
        (id, name, type, cost, cost_vnd, cpu, ram, memory, feature, bandwidth, updated_at, is_active)
      VALUES
        (1900, 'BM.GPU3.8',        'ai', 18197.120000,   478766227.200000, '104 vCPU', '768GB RAM',  '1024GB SSD Storage', E'8 GPU NVIDIA Tesla V100 16GB\nBlock storage only',        'Dedicated AI infrastructure', now(), true),
        (1901, 'BM.GPU4.8',        'ai', 18197.120000,   478766227.200000, '128 vCPU', '2048GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA A100 40GB\n27.2TB NVMe local (4 drives)',   'Dedicated AI infrastructure', now(), true),
        (1902, 'BM.GPU.A10.4',     'ai',  5995.520000,   157742131.200000, '128 vCPU', '1024GB RAM', '1024GB SSD Storage', E'4 GPU NVIDIA A10 24GB\n7.68TB NVMe local (2 drives)',    'Dedicated AI infrastructure', now(), true),
        (1903, 'BM.GPU.A100-v2.8', 'ai', 23851.520000,   627533491.200000, '256 vCPU', '2048GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA A100 80GB\n27.2TB NVMe local (4 drives)',   'Dedicated AI infrastructure', now(), true),
        (1904, 'BM.GPU.L40S.4',    'ai', 10459.520000,   275189971.200000, '224 vCPU', '1024GB RAM', '1024GB SSD Storage', E'4 GPU NVIDIA L40S 48GB\n2 x 3.84TB NVMe local',          'Dedicated AI infrastructure', now(), true),
        (1905, 'BM.GPU.H100.8',    'ai', 59563.520000,  1567116211.200000, '224 vCPU', '2048GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA H100 80GB\n16 x 3.84TB NVMe local',         'Dedicated AI infrastructure', now(), true),
        (1906, 'BM.GPU.H200.8',    'ai', 59563.520000,  1567116211.200000, '224 vCPU', '3072GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA H200 Tensor Core 141GB\n8 x 3.84TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1907, 'BM.GPU.B200.8',    'ai', 83371.520000,  2193504691.200000, '256 vCPU', '4096GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA B200 Tensor Core 180GB\n8 x 3.84TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1908, 'BM.GPU.B300.8',    'ai', 89323.520000,  2350101811.200000, '256 vCPU', '4096GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA B300 Tensor Core 263GB\n8 x 3.84TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1909, 'BM.GPU.GB200.4',   'ai', 47659.520000,  1253921971.200000, '288 vCPU', '960GB RAM',  '1024GB SSD Storage', E'4 GPU NVIDIA Blackwell GB200 192GB\n4 x 7.68TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1910, 'BM.GPU.GB300.4',   'ai', 53611.520000,  1410519091.200000, '288 vCPU', '960GB RAM',  '1024GB SSD Storage', E'4 GPU NVIDIA Blackwell GB300 278GB\n4 x 7.68TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1911, 'BM.GPU.MI300X.8',  'ai', 35755.520000,   940727731.200000, '224 vCPU', '2048GB RAM', '1024GB SSD Storage', E'8 GPU AMD Instinct MI300X 192GB\n8 x 3.84TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1912, 'BM.GPU.MI355X.8',  'ai', 51230.720000,  1347880243.200000, '256 vCPU', '3072GB RAM', '1024GB SSD Storage', E'8 GPU AMD Instinct MI355X 288GB\n8 x 7.68TB NVMe local', 'Dedicated AI infrastructure', now(), true),
        (1913, 'BM.GPU.RTXPRO.8',  'ai', 26827.520000,   705832051.200000, '288 vCPU', '3072GB RAM', '1024GB SSD Storage', E'8 GPU NVIDIA RTX PRO 6000 Blackwell 96GB\n8 x 7.68TB NVMe local', 'Dedicated AI infrastructure', now(), true)
      ON CONFLICT (id) DO NOTHING
    `);

    // Correct + reprice the four pre-existing AI rows onto the same source and rate.
    await queryRunner.query(`
      UPDATE oracle.cloud_packages
      SET cost = 1940.720000, cost_vnd = 51060343.200000,
          cpu = '56 vCPU', ram = '192GB RAM', memory = '1024GB SSD Storage',
          feature = E'2 GPU NVIDIA Tesla P100 16GB\nBlock storage only', updated_at = now()
      WHERE name = 'BM.GPU2.2'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages
      SET cost = 992.120000, cost_vnd = 26102677.200000,
          cpu = '24 vCPU', ram = '72GB RAM', memory = '1024GB SSD Storage',
          feature = E'1 GPU NVIDIA Tesla P100 16GB\nBlock storage only', updated_at = now()
      WHERE name = 'VM.GPU2.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages
      SET cost = 1531.520000, cost_vnd = 40294291.200000,
          cpu = '30 vCPU', ram = '240GB RAM', memory = '1024GB SSD Storage',
          feature = E'1 GPU NVIDIA A10 24GB\nBlock storage only', updated_at = now()
      WHERE name = 'VM.GPU.A10.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages
      SET cost = 3019.520000, cost_vnd = 79443571.200000,
          cpu = '60 vCPU', ram = '480GB RAM', memory = '1024GB SSD Storage',
          feature = E'2 GPU NVIDIA A10 24GB\nBlock storage only', updated_at = now()
      WHERE name = 'VM.GPU.A10.2'
    `);

    console.log('AI/GPU catalogue: added 14 bare-metal GPU shapes, corrected + repriced 4 existing rows');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM oracle.cloud_packages WHERE id BETWEEN 1900 AND 1913`);
    // Restore the original values (old FX rate, GPU memory in the RAM column).
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cost = 1940.720000, cost_vnd = 49217256.000000,
        cpu = 'AI Optimized', ram = '32GB RAM', memory = '1024GB SSD Storage',
        feature = '2 GPU Tesla P100' WHERE name = 'BM.GPU2.2'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cost = 992.120000, cost_vnd = 25160242.000000,
        cpu = 'AI Optimized', ram = '16GB RAM', memory = '1024GB SSD Storage',
        feature = '1 GPU Tesla P100' WHERE name = 'VM.GPU2.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cost = 1531.520000, cost_vnd = 38849544.000000,
        cpu = 'AI Optimized', ram = '24GB RAM', memory = '1024GB SSD Storage',
        feature = '1 GPU A10 Tensor Core' WHERE name = 'VM.GPU.A10.1'
    `);
    await queryRunner.query(`
      UPDATE oracle.cloud_packages SET cost = 2980.250000, cost_vnd = 75590344.000000,
        cpu = 'AI Optimized', ram = '48GB RAM', memory = '1024GB SSD Storage',
        feature = '2 GPU A10 Tensor Core' WHERE name = 'VM.GPU.A10.2'
    `);
  }
}
