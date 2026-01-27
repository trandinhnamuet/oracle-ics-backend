import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSshKey } from '../../entities/system-ssh-key.entity';
import { SystemSshKeyService } from './system-ssh-key.service';
import { SystemSshKeyController } from './system-ssh-key.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSshKey])],
  controllers: [SystemSshKeyController],
  providers: [SystemSshKeyService],
  exports: [SystemSshKeyService],
})
export class SystemSshKeyModule {}
