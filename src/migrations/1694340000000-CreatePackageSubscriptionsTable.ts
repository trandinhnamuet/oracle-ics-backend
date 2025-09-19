import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreatePackageSubscriptionsTable1694340000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "package_subscriptions",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "name",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "type",
            type: "text",
            isNullable: false,
          },
          {
            name: "cost",
            type: "float",
            isNullable: false,
          },
          {
            name: "cpu",
            type: "text",
            isNullable: false,
          },
          {
            name: "ram",
            type: "text",
            isNullable: false,
          },
          {
            name: "memory",
            type: "text",
            isNullable: false,
          },
          {
            name: "feature",
            type: "text",
            isNullable: true,
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_by",
            type: "varchar",
            length: "255",
            isNullable: true,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
            isNullable: false,
          },
        ],
      })
    );

    // Insert starter plans
    await queryRunner.query(`
      INSERT INTO package_subscriptions (name, type, cost, cpu, ram, memory, feature, updated_by, is_active) VALUES
      ('Starter 1', 'Starter', 250000, '1 vCPU', '8GB', '100GB SSD Storage', '["1 vCPU, 8GB RAM", "100GB SSD Storage", "1TB Bandwidth", "Hỗ trợ email 24/7"]', 'system', true),
      ('Starter 2', 'Starter', 300000, '2 vCPU', '12GB', '150GB SSD Storage', '["2 vCPU, 12GB RAM", "150GB SSD Storage", "2TB Bandwidth", "Hỗ trợ email 24/7"]', 'system', true),
      ('Starter 3', 'Starter', 350000, '3 vCPU', '16GB', '200GB SSD Storage', '["3 vCPU, 16GB RAM", "200GB SSD Storage", "3TB Bandwidth", "Hỗ trợ email 24/7"]', 'system', true),
      ('Starter 4', 'Starter', 400000, '4 vCPU', '20GB', '250GB SSD Storage', '["4 vCPU, 20GB RAM", "250GB SSD Storage", "4TB Bandwidth", "Hỗ trợ email 24/7"]', 'system', true),
      ('Starter 5', 'Starter', 450000, '5 vCPU', '24GB', '300GB SSD Storage', '["5 vCPU, 24GB RAM", "300GB SSD Storage", "5TB Bandwidth", "Backup tự động hàng ngày"]', 'system', true),
      ('Starter 6', 'Starter', 500000, '6 vCPU', '28GB', '350GB SSD Storage', '["6 vCPU, 28GB RAM", "350GB SSD Storage", "6TB Bandwidth", "Load balancer cơ bản"]', 'system', true),
      ('Starter 7', 'Starter', 550000, '7 vCPU', '32GB', '400GB SSD Storage', '["7 vCPU, 32GB RAM", "400GB SSD Storage", "7TB Bandwidth", "Load balancer cơ bản"]', 'system', true),
      ('Starter 8', 'Starter', 600000, '8 vCPU', '36GB', '450GB SSD Storage', '["8 vCPU, 36GB RAM", "450GB SSD Storage", "8TB Bandwidth", "Auto scaling"]', 'system', true),
      ('Starter 9', 'Starter', 650000, '9 vCPU', '40GB', '500GB SSD Storage', '["9 vCPU, 40GB RAM", "500GB SSD Storage", "9TB Bandwidth", "Auto scaling"]', 'system', true),
      ('Starter 10', 'Starter', 700000, '10 vCPU', '44GB', '550GB SSD Storage', '["10 vCPU, 44GB RAM", "550GB SSD Storage", "10TB Bandwidth", "Auto scaling"]', 'system', true)
    `);

    // Insert professional plans
    await queryRunner.query(`
      INSERT INTO package_subscriptions (name, type, cost, cpu, ram, memory, feature, updated_by, is_active) VALUES
      ('Professional 1', 'Professional', 580000, '4 vCPU', '16GB', '500GB SSD Storage', '["4 vCPU, 16GB RAM", "500GB SSD Storage", "5TB Bandwidth", "Hỗ trợ điện thoại 24/7"]', 'system', true),
      ('Professional 2', 'Professional', 660000, '5 vCPU', '24GB', '700GB SSD Storage', '["5 vCPU, 24GB RAM", "700GB SSD Storage", "7TB Bandwidth", "Backup tự động 4 lần/ngày"]', 'system', true),
      ('Professional 3', 'Professional', 740000, '6 vCPU', '32GB', '900GB SSD Storage', '["6 vCPU, 32GB RAM", "900GB SSD Storage", "9TB Bandwidth", "Monitoring nâng cao"]', 'system', true),
      ('Professional 4', 'Professional', 820000, '7 vCPU', '40GB', '1100GB SSD Storage', '["7 vCPU, 40GB RAM", "1100GB SSD Storage", "11TB Bandwidth", "Load Balancer"]', 'system', true),
      ('Professional 5', 'Professional', 900000, '8 vCPU', '48GB', '1300GB SSD Storage', '["8 vCPU, 48GB RAM", "1300GB SSD Storage", "13TB Bandwidth", "Auto Scaling"]', 'system', true),
      ('Professional 6', 'Professional', 980000, '9 vCPU', '56GB', '1500GB SSD Storage', '["9 vCPU, 56GB RAM", "1500GB SSD Storage", "15TB Bandwidth", "Database clustering"]', 'system', true),
      ('Professional 7', 'Professional', 1060000, '10 vCPU', '64GB', '1700GB SSD Storage', '["10 vCPU, 64GB RAM", "1700GB SSD Storage", "17TB Bandwidth", "Multi-region support"]', 'system', true),
      ('Professional 8', 'Professional', 1140000, '11 vCPU', '72GB', '1900GB SSD Storage', '["11 vCPU, 72GB RAM", "1900GB SSD Storage", "19TB Bandwidth", "Advanced analytics"]', 'system', true),
      ('Professional 9', 'Professional', 1220000, '12 vCPU', '80GB', '2100GB SSD Storage', '["12 vCPU, 80GB RAM", "2100GB SSD Storage", "21TB Bandwidth", "Custom integrations"]', 'system', true),
      ('Professional 10', 'Professional', 1300000, '13 vCPU', '88GB', '2300GB SSD Storage', '["13 vCPU, 88GB RAM", "2300GB SSD Storage", "23TB Bandwidth", "Custom integrations"]', 'system', true)
    `);

    // Insert enterprise plans
    await queryRunner.query(`
      INSERT INTO package_subscriptions (name, type, cost, cpu, ram, memory, feature, updated_by, is_active) VALUES
      ('Enterprise 1', 'Enterprise', 1250000, '8 vCPU', '32GB', '2TB SSD Storage', '["8 vCPU, 32GB RAM", "2TB SSD Storage", "Unlimited Bandwidth", "Dedicated Account Manager"]', 'system', true),
      ('Enterprise 2', 'Enterprise', 1400000, '10 vCPU', '48GB', '3TB SSD Storage', '["10 vCPU, 48GB RAM", "3TB SSD Storage", "Unlimited Bandwidth", "Backup real-time"]', 'system', true),
      ('Enterprise 3', 'Enterprise', 1550000, '12 vCPU', '64GB', '4TB SSD Storage', '["12 vCPU, 64GB RAM", "4TB SSD Storage", "Unlimited Bandwidth", "Monitoring enterprise"]', 'system', true),
      ('Enterprise 4', 'Enterprise', 1700000, '14 vCPU', '80GB', '5TB SSD Storage', '["14 vCPU, 80GB RAM", "5TB SSD Storage", "Unlimited Bandwidth", "Multi-region Load Balancer"]', 'system', true),
      ('Enterprise 5', 'Enterprise', 1850000, '16 vCPU', '96GB', '6TB SSD Storage', '["16 vCPU, 96GB RAM", "6TB SSD Storage", "Unlimited Bandwidth", "Auto Scaling unlimited"]', 'system', true),
      ('Enterprise 6', 'Enterprise', 2000000, '18 vCPU', '112GB', '7TB SSD Storage', '["18 vCPU, 112GB RAM", "7TB SSD Storage", "Unlimited Bandwidth", "Database clustering + HA"]', 'system', true),
      ('Enterprise 7', 'Enterprise', 2150000, '20 vCPU', '128GB', '8TB SSD Storage', '["20 vCPU, 128GB RAM", "8TB SSD Storage", "Unlimited Bandwidth", "SLA 99.99%"]', 'system', true),
      ('Enterprise 8', 'Enterprise', 2300000, '22 vCPU', '144GB', '9TB SSD Storage', '["22 vCPU, 144GB RAM", "9TB SSD Storage", "Unlimited Bandwidth", "Priority support"]', 'system', true),
      ('Enterprise 9', 'Enterprise', 2450000, '24 vCPU', '160GB', '10TB SSD Storage', '["24 vCPU, 160GB RAM", "10TB SSD Storage", "Unlimited Bandwidth", "White-label options"]', 'system', true),
      ('Enterprise 10', 'Enterprise', 2600000, '26 vCPU', '176GB', '11TB SSD Storage', '["26 vCPU, 176GB RAM", "11TB SSD Storage", "Unlimited Bandwidth", "24/7 on-site support"]', 'system', true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("package_subscriptions");
  }
}
