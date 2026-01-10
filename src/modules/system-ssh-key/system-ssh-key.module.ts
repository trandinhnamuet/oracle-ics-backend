import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSshKey } from '../../entities/system-ssh-key.entity';
import { SystemSshKeyService } from './system-ssh-key.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSshKey])],
  providers: [SystemSshKeyService],
  exports: [SystemSshKeyService],
})
export class SystemSshKeyModule {}
