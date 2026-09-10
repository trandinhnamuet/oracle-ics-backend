import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OciCostController } from './oci-cost.controller';
import { OciCostService } from './oci-cost.service';
import { BandwidthModule } from '../bandwidth/bandwidth.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { OciModule } from '../oci/oci.module';
import { VmInstance } from '../../entities/vm-instance.entity';
import { VmStateHistory } from '../../entities/vm-state-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VmInstance, VmStateHistory]),
    BandwidthModule,
    ExchangeRateModule,
    OciModule,
  ],
  controllers: [OciCostController],
  providers: [OciCostService],
  exports: [OciCostService],
})
export class OciCostModule {}
