import { Module } from '@nestjs/common';
import { SepayController } from './sepay.controller';
import { SepayService } from './sepay.service';
import { UserPackageModule } from '../user-package/user-package.module';

@Module({
  imports: [UserPackageModule],
  controllers: [SepayController],
  providers: [SepayService],
  exports: [SepayService],
})
export class SepayModule {}