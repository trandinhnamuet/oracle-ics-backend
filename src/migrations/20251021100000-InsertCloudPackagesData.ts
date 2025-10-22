import { MigrationInterface, QueryRunner } from 'typeorm';

export class InsertCloudPackagesData20251021100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Starter Plans
    const starterPlans = [
      {
        name: 'Starter 1',
        type: 'starter',
        cost: 12.75,
        cost_vnd: 323250, // Assuming 1 USD = 25350 VND (approximate rate)
        cpu: '2 vCPU',
        ram: '1GB RAM',
        memory: '20GB SSD Storage',
        feature: 'Basic hosting',
        bandwidth: 'Bandwidth 300Mbps'
      },
      {
        name: 'Starter 2',
        type: 'starter',
        cost: 15.09,
        cost_vnd: 382533,
        cpu: '2 vCPU',
        ram: '2GB RAM',
        memory: '40GB SSD Storage',
        feature: 'Basic hosting',
        bandwidth: 'Bandwidth 300Mbps'
      },
      {
        name: 'Starter 3',
        type: 'starter',
        cost: 30.18,
        cost_vnd: 765063,
        cpu: '4 vCPU',
        ram: '4GB RAM',
        memory: '80GB SSD Storage',
        feature: 'Basic hosting',
        bandwidth: 'Bandwidth 300Mbps'
      },
      {
        name: 'Starter 4',
        type: 'starter',
        cost: 36.14,
        cost_vnd: 916749,
        cpu: '4 vCPU',
        ram: '8GB RAM',
        memory: '80GB SSD Storage',
        feature: 'Basic hosting',
        bandwidth: 'Bandwidth 300Mbps'
      },
      {
        name: 'Starter 5',
        type: 'starter',
        cost: 57.82,
        cost_vnd: 1465797,
        cpu: '8 vCPU',
        ram: '8GB RAM',
        memory: '100GB SSD Storage',
        feature: 'Basic hosting',
        bandwidth: 'Bandwidth 300Mbps'
      }
    ];

    // Professional Plans
    const professionalPlans = [
      {
        name: 'Professional 1',
        type: 'professional',
        cost: 48.15,
        cost_vnd: 1221523,
        cpu: '4 vCPU',
        ram: '6GB RAM',
        memory: '100GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Professional 2',
        type: 'professional',
        cost: 71.10,
        cost_vnd: 1802385,
        cpu: '6 vCPU',
        ram: '8GB RAM',
        memory: '150GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Professional 3',
        type: 'professional',
        cost: 89.70,
        cost_vnd: 2273895,
        cpu: '8 vCPU',
        ram: '10GB RAM',
        memory: '150GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Professional 4',
        type: 'professional',
        cost: 94.17,
        cost_vnd: 2388309,
        cpu: '8 vCPU',
        ram: '12GB RAM',
        memory: '150GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Professional 5',
        type: 'professional',
        cost: 100.76,
        cost_vnd: 2554266,
        cpu: '8 vCPU',
        ram: '16GB RAM',
        memory: '200GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Professional 6',
        type: 'professional',
        cost: 118.61,
        cost_vnd: 3006669,
        cpu: '8 vCPU',
        ram: '32GB RAM',
        memory: '200GB SSD Storage',
        feature: 'Advanced features',
        bandwidth: 'Băng thông 300Mbps'
      }
    ];

    // Enterprise Plans
    const enterprisePlans = [
      {
        name: 'Enterprise 1',
        type: 'enterprise',
        cost: 121.48,
        cost_vnd: 3081498,
        cpu: '10 vCPU',
        ram: '16GB RAM',
        memory: '250GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 2',
        type: 'enterprise',
        cost: 140.08,
        cost_vnd: 3553028,
        cpu: '12 vCPU',
        ram: '16GB RAM',
        memory: '250GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 3',
        type: 'enterprise',
        cost: 152.94,
        cost_vnd: 3879969,
        cpu: '12 vCPU',
        ram: '18GB RAM',
        memory: '500GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 4',
        type: 'enterprise',
        cost: 205.76,
        cost_vnd: 5221016,
        cpu: '16 vCPU',
        ram: '32GB RAM',
        memory: '500GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 5',
        type: 'enterprise',
        cost: 228.03,
        cost_vnd: 5780961,
        cpu: '16 vCPU',
        ram: '32GB RAM',
        memory: '1024GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 6',
        type: 'enterprise',
        cost: 302.43,
        cost_vnd: 7671631,
        cpu: '24 vCPU',
        ram: '32GB RAM',
        memory: '1024GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 7',
        type: 'enterprise',
        cost: 326.24,
        cost_vnd: 8275284,
        cpu: '36 vCPU',
        ram: '64GB RAM',
        memory: '1024GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Enterprise 8',
        type: 'enterprise',
        cost: 483.97,
        cost_vnd: 12268640,
        cpu: '48 vCPU',
        ram: '128GB RAM',
        memory: '1024GB SSD Storage',
        feature: 'Enterprise grade',
        bandwidth: 'Băng thông 300Mbps'
      },
      {
        name: 'Tư vấn toàn diện',
        type: 'starter',
        cost: 0.16,
        cost_vnd: 4056,
        cpu: '0 vCPU',
        ram: '0 RAM',
        memory: '0GB SSD Storage',
        feature: 'Consultation only',
        bandwidth: 'Băng thông 300Mbps'
      }
    ];

    // AI Plans
    const aiPlans = [
      {
        name: 'VM.GPU2.1',
        type: 'ai',
        cost: 992.12,
        cost_vnd: 25160242,
        cpu: 'AI Optimized',
        ram: '16GB RAM',
        memory: '1024GB SSD Storage',
        feature: '1 GPU Tesla P100',
        bandwidth: 'Hạ tầng AI chuyên dụng'
      },
      {
        name: 'VM.GPU.A10.1',
        type: 'ai',
        cost: 1531.52,
        cost_vnd: 38849544,
        cpu: 'AI Optimized',
        ram: '24GB RAM',
        memory: '1024GB SSD Storage',
        feature: '1 GPU A10 Tensor Core',
        bandwidth: 'Hạ tầng AI chuyên dụng'
      },
      {
        name: 'BM.GPU2.2',
        type: 'ai',
        cost: 1940.72,
        cost_vnd: 49217256,
        cpu: 'AI Optimized',
        ram: '32GB RAM',
        memory: '1024GB SSD Storage',
        feature: '2 GPU Tesla P100',
        bandwidth: 'Hạ tầng AI chuyên dụng'
      },
      {
        name: 'VM.GPU.A10.2',
        type: 'ai',
        cost: 2980.25,
        cost_vnd: 75590344,
        cpu: 'AI Optimized',
        ram: '48GB RAM',
        memory: '1024GB SSD Storage',
        feature: '2 GPU A10 Tensor Core',
        bandwidth: 'Hạ tầng AI chuyên dụng'
      }
    ];

    // Combine all plans
    const allPlans = [...starterPlans, ...professionalPlans, ...enterprisePlans, ...aiPlans];

    // Insert data
    for (const plan of allPlans) {
      await queryRunner.query(`
        INSERT INTO oracle.cloud_packages (
          name, type, cost, cost_vnd, cpu, ram, memory, feature, bandwidth, is_active
        ) VALUES (
          '${plan.name}', 
          '${plan.type}', 
          ${plan.cost}, 
          ${plan.cost_vnd}, 
          '${plan.cpu}', 
          '${plan.ram}', 
          '${plan.memory}', 
          '${plan.feature}', 
          '${plan.bandwidth}', 
          true
        );
      `);
    }

    console.log(`Đã thêm ${allPlans.length} cloud packages vào database`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM oracle.cloud_packages 
      WHERE name IN (
        'Starter 1', 'Starter 2', 'Starter 3', 'Starter 4', 'Starter 5',
        'Professional 1', 'Professional 2', 'Professional 3', 'Professional 4', 'Professional 5', 'Professional 6',
        'Enterprise 1', 'Enterprise 2', 'Enterprise 3', 'Enterprise 4', 'Enterprise 5', 'Enterprise 6', 'Enterprise 7', 'Enterprise 8', 'Tư vấn toàn diện',
        'VM.GPU2.1', 'VM.GPU.A10.1', 'BM.GPU2.2', 'VM.GPU.A10.2'
      );
    `);
    console.log('Đã xóa dữ liệu cloud packages');
  }
}