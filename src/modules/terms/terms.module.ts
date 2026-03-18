import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsSection } from '../../entities/terms-section.entity';
import { TermsService } from './terms.service';
import { TermsController } from './terms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TermsSection])],
  providers: [TermsService],
  controllers: [TermsController],
  exports: [TermsService],
})
export class TermsModule {}
