import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OciController } from './oci.controller';
import { OciService } from './oci.service';
import { VmInstance } from '../../entities/vm-instance.entity';

@Module({
  // VmInstance is needed so the controller can confirm that an OCI instance a
  // customer asks about is actually one of their own VMs.
  imports: [TypeOrmModule.forFeature([VmInstance])],
  controllers: [OciController],
  providers: [OciService],
  exports: [OciService],
})
export class OciModule {}
