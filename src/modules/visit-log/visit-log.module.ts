import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { VisitLogService } from './visit-log.service'
import { VisitLogController } from './visit-log.controller'
import { SiteVisitEntity } from '../../entities/site-visit.entity'

@Module({
  imports: [TypeOrmModule.forFeature([SiteVisitEntity])],
  controllers: [VisitLogController],
  providers: [VisitLogService],
  exports: [VisitLogService],
})
export class VisitLogModule {}
