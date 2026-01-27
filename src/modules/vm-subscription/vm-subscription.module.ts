import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VmSubscriptionController } from './vm-subscription.controller';
import { VmSubscriptionService } from './vm-subscription.service';
import { Subscription } from '../../entities/subscription.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { VmProvisioningModule } from '../vm-provisioning/vm-provisioning.module';
import { SystemSshKeyModule } from '../system-ssh-key/system-ssh-key.module';
import { OciModule } from '../oci/oci.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, VmInstance]),
    VmProvisioningModule,
    SystemSshKeyModule,
    OciModule,
  ],
  controllers: [VmSubscriptionController],
  providers: [VmSubscriptionService],
  exports: [VmSubscriptionService],
})
export class VmSubscriptionModule {}
