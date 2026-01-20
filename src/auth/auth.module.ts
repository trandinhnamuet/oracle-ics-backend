import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../entities/user.entity';
import { UserSession } from './user-session.entity';
import { SessionCleanupService } from './session-cleanup.service';
import { EmailModule } from '../modules/email/email.module';
import { AdminLoginHistory } from '../entities/admin-login-history.entity';
import { AdminLoginHistoryService } from './admin-login-history.service';
import { AdminLoginHistoryController } from './admin-login-history.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, UserSession, AdminLoginHistory]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'jwt-secret-key-42jfwj2k',
        signOptions: { expiresIn: '30p' },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
  ],
  providers: [AuthService, JwtStrategy, SessionCleanupService, AdminLoginHistoryService],
  controllers: [AuthController, AdminLoginHistoryController],
  exports: [AuthService, AdminLoginHistoryService],
})
export class AuthModule {}
