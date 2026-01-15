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

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, UserSession]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'jwt-secret-key-42jfwj2k',
        signOptions: { expiresIn: '10s' },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
  ],
  providers: [AuthService, JwtStrategy, SessionCleanupService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
