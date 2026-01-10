import { Module } from '@nestjs/common';
import { OciController } from './oci.controller';
import { OciService } from './oci.service';

@Module({
  controllers: [OciController],
  providers: [OciService],
  exports: [OciService],
})
export class OciModule {}
