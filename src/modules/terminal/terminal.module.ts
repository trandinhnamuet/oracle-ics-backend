import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { TerminalGateway } from './terminal.gateway';
import { TerminalService } from './terminal.service';
import { VmInstance } from '../../entities/vm-instance.entity';
import { SystemSshKey } from '../../entities/system-ssh-key.entity';
import { UserSession } from '../../auth/user-session.entity';
import { Subscription } from '../../entities/subscription.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VmInstance, SystemSshKey, UserSession, Subscription, User]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is not set');
        }
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
    }),
  ],
  providers: [TerminalGateway, TerminalService],
  exports: [TerminalService],
})
export class TerminalModule {}
