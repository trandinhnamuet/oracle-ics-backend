import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VmProvisioningController } from './vm-provisioning.controller';
import { VmProvisioningService } from './vm-provisioning.service';
import { User } from '../../entities/user.entity';
import { UserCompartment } from '../../entities/user-compartment.entity';
import { VcnResource } from '../../entities/vcn-resource.entity';
import { VmInstance } from '../../entities/vm-instance.entity';
import { VmActionsLog } from '../../entities/vm-actions-log.entity';
import { CompartmentAccount } from '../../entities/compartment-account.entity';
import { OciModule } from '../oci/oci.module';
import { SystemSshKeyModule } from '../system-ssh-key/system-ssh-key.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserCompartment,
      VcnResource,
      VmInstance,
      VmActionsLog,
      CompartmentAccount,
    ]),
    OciModule,
    SystemSshKeyModule,
  ],
  controllers: [VmProvisioningController],
  providers: [VmProvisioningService],
  exports: [VmProvisioningService],
})
export class VmProvisioningModule {}
