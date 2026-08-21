import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCloudPackagesTable20260508100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.cloud_packages');
    if (tableExists) { console.log('Table oracle.cloud_packages already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.cloud_packages (
        id SERIAL NOT NULL,
        name character varying(20) NOT NULL,
        type character varying(20),
        cost numeric(15,6) NOT NULL,
        cost_vnd numeric(18,6) NOT NULL,
        cpu character varying(50),
        ram character varying(50),
        memory character varying(50),
        feature character varying(50),
        bandwidth character varying(50),
        updated_at timestamp with time zone DEFAULT now(),
        updated_by integer,
        is_active boolean DEFAULT true,
        CONSTRAINT cloud_packages_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_cloud_packages_is_active ON oracle.cloud_packages (is_active)`);
    await queryRunner.query(`CREATE INDEX idx_cloud_packages_type ON oracle.cloud_packages (type)`);

    await queryRunner.query(`
      INSERT INTO oracle.cloud_packages (id, name, type, cost, cost_vnd, cpu, ram, memory, feature, bandwidth, updated_at, is_active) VALUES
      -- Prices for compute (vCPU) packages recomputed 2026-08-21 at OCI E5.Flex
      -- vendor rates (vCPU $0.0150/h, RAM $0.0020/GB/h, storage $0.0425/GB/mo, 744h/mo,
      -- no markup) with USD->VND = 26310. GPU/AI and consultation packages unchanged.
      (2, 'Starter 2', 'starter', 26.996000, 710264.760000, '2 vCPU', '2GB RAM', '40GB SSD Storage', 'Basic hosting', 'Bandwidth 300Mbps', '2025-12-16 21:59:23+00', true),
      (20, 'Tư vấn toàn diện', 'enterprise', 0.160000, 4056.000000, '0 vCPU', '0 RAM', '0GB SSD Storage', 'Enterprise grade', 'Bandwidth 300Mbps', '2025-12-16 21:59:23+00', true),
      (1775, 'Enterprise 1', 'enterprise', 146.033000, 3842128.230000, '10 vCPU', '16GB RAM', '250GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:29+00', true),
      (1777, 'Enterprise 3', 'enterprise', 181.954000, 4787209.740000, '12 vCPU', '18GB RAM', '500GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:29+00', true),
      (1778, 'Enterprise 4', 'enterprise', 247.426000, 6509778.060000, '16 vCPU', '32GB RAM', '500GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:29+00', true),
      (1786, 'BM.GPU2.2', 'ai', 1940.720000, 49217256.000000, 'AI Optimized', '32GB RAM', '1024GB SSD Storage', '2 GPU Tesla P100', 'Dedicated AI infrastructure', '2026-04-01 01:23:29+00', true),
      (1790, 'Starter 3', 'starter', 53.992000, 1420529.520000, '4 vCPU', '4GB RAM', '80GB SSD Storage', 'Basic hosting', 'Bandwidth 300Mbps', '2026-04-01 01:23:30+00', true),
      (1791, 'Starter 4', 'starter', 59.944000, 1577126.640000, '4 vCPU', '8GB RAM', '80GB SSD Storage', 'Basic hosting', 'Bandwidth 300Mbps', '2026-04-01 01:23:30+00', true),
      (1792, 'Starter 5', 'starter', 105.434000, 2773968.540000, '8 vCPU', '8GB RAM', '100GB SSD Storage', 'Basic hosting', 'Bandwidth 300Mbps', '2026-04-01 01:23:30+00', true),
      (1793, 'Professional 1', 'professional', 57.818000, 1521191.580000, '4 vCPU', '6GB RAM', '100GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1794, 'Professional 2', 'professional', 85.239000, 2242638.090000, '6 vCPU', '8GB RAM', '150GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1795, 'Professional 3', 'professional', 110.535000, 2908175.850000, '8 vCPU', '10GB RAM', '150GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1796, 'Professional 4', 'professional', 113.511000, 2986474.410000, '8 vCPU', '12GB RAM', '150GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1797, 'Professional 5', 'professional', 121.588000, 3198980.280000, '8 vCPU', '16GB RAM', '200GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1798, 'Professional 6', 'professional', 145.396000, 3825368.760000, '8 vCPU', '32GB RAM', '200GB SSD Storage', 'Advanced features', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1800, 'Enterprise 2', 'enterprise', 168.353000, 4429367.430000, '12 vCPU', '16GB RAM', '250GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1822, 'Starter 2.5', 'starter', 31.672000, 833290.320000, '2 vCPU', '4GB RAM', '80GB SSD Storage', NULL, 'Bandwidth 300Mbps', '2026-05-07 17:53:43+00', true),
      (1803, 'Enterprise 5', 'enterprise', 269.696000, 7095701.760000, '16 vCPU', '32GB RAM', '1024GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1804, 'Enterprise 6', 'enterprise', 358.976000, 9444658.560000, '24 vCPU', '32GB RAM', '1024GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1805, 'Enterprise 7', 'enterprise', 540.512000, 14220870.720000, '36 vCPU', '64GB RAM', '1024GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1806, 'Enterprise 8', 'enterprise', 769.664000, 20249859.840000, '48 vCPU', '128GB RAM', '1024GB SSD Storage', 'Enterprise grade', 'Băng thông 300Mbps', '2026-04-01 01:23:30+00', true),
      (1812, 'Starter 1', 'starter', 24.658000, 648751.980000, '2 vCPU', '1GB RAM', '20GB SSD', 'Basic hosting', '300Mbps', '2026-04-01 01:32:56+00', true),
      (1808, 'VM.GPU2.1', 'ai', 992.120000, 25160242.000000, 'AI Optimized', '16GB RAM', '1024GB SSD Storage', '1 GPU Tesla P100', 'Dedicated AI infrastructure', '2026-04-01 01:23:30+00', true),
      (1809, 'VM.GPU.A10.1', 'ai', 1531.520000, 38849544.000000, 'AI Optimized', '24GB RAM', '1024GB SSD Storage', '1 GPU A10 Tensor Core', 'Dedicated AI infrastructure', '2026-04-01 01:23:30+00', true),
      (1811, 'VM.GPU.A10.2', 'ai', 2980.250000, 75590344.000000, 'AI Optimized', '48GB RAM', '1024GB SSD Storage', '2 GPU A10 Tensor Core', 'Dedicated AI infrastructure', '2026-04-01 01:23:30+00', true)
    `);

    await queryRunner.query(`SELECT setval('oracle.cloud_packages_id_seq', 1822)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.cloud_packages CASCADE`);
  }
}
