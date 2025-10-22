import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudPackageService } from './cloud-package.service';
import { CloudPackageController } from './cloud-package.controller';
import { CloudPackage } from '../../entities/cloud-package.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CloudPackage])],
  controllers: [CloudPackageController],
  providers: [CloudPackageService],
  exports: [CloudPackageService],
})
export class CloudPackageModule {}