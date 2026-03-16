import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BandwidthController } from './bandwidth.controller';
import { BandwidthService } from './bandwidth.service';
import { BandwidthSnapshotTask } from './bandwidth-recording.task';
import { OciModule } from '../oci/oci.module';
import { VmInstance } from '../../entities/vm-instance.entity';
import { BandwidthSnapshot } from '../../entities/bandwidth-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VmInstance, BandwidthSnapshot]),
    OciModule,
  ],
  controllers: [BandwidthController],
  providers: [BandwidthService, BandwidthSnapshotTask],
  exports: [BandwidthService],
})
export class BandwidthModule {}
