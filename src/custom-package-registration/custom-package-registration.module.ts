import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomPackageRegistrationService } from './custom-package-registration.service';
import { CustomPackageRegistrationController } from './custom-package-registration.controller';
import { CustomPackageRegistration } from '../entities/custom-package-registration.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomPackageRegistration])],
  controllers: [CustomPackageRegistrationController],
  providers: [CustomPackageRegistrationService],
  exports: [CustomPackageRegistrationService],
})
export class CustomPackageRegistrationModule {}