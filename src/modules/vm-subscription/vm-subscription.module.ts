import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VmSubscriptionController } from './vm-subscription.controller';
import { VmSubscriptionService } from './vm-subscription.service';
import { Subscription } from '../../entities/subscription.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { User } from '../../entities/user.entity';
import { VmProvisioningModule } from '../vm-provisioning/vm-provisioning.module';
import { SystemSshKeyModule } from '../system-ssh-key/system-ssh-key.module';
import { OciModule } from '../oci/oci.module';
import { OtpModule } from '../otp/otp.module';
import { BandwidthModule } from '../bandwidth/bandwidth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, VmInstance, User]),
    VmProvisioningModule,
    SystemSshKeyModule,
    OciModule,
    OtpModule,
    BandwidthModule,
  ],
  controllers: [VmSubscriptionController],
  providers: [VmSubscriptionService],
  exports: [VmSubscriptionService],
})
export class VmSubscriptionModule {}
