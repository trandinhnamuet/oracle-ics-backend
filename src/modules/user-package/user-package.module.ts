import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPackageService } from './user-package.service';
import { UserPackageController } from './user-package.controller';
import { UserPackage } from '../../entities/user-package.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPackage, User])
  ],
  controllers: [UserPackageController],
  providers: [UserPackageService],
  exports: [UserPackageService],
})
export class UserPackageModule {}