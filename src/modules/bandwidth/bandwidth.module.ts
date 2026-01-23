import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BandwidthController } from './bandwidth.controller';
import { BandwidthService } from './bandwidth.service';
import { BandwidthRecordingTask } from './bandwidth-recording.task';
import { OciModule } from '../oci/oci.module';
import { VmInstance } from '../../entities/vm-instance.entity';
import { Subscription } from '../../entities/subscription.entity';
import { User } from '../../entities/user.entity';
import { BandwidthLog } from '../../entities/bandwidth-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VmInstance, Subscription, User, BandwidthLog]),
    OciModule,
  ],
  controllers: [BandwidthController],
  providers: [BandwidthService, BandwidthRecordingTask],
  exports: [BandwidthService],
})
export class BandwidthModule {}
