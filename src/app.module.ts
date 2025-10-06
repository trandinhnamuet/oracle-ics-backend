import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CustomPackageRegistrationModule } from './custom-package-registration/custom-package-registration.module';
import { UserModule } from './users/user.module';
import { UserPackageModule } from './modules/user-package/user-package.module';
import { SepayModule } from './modules/sepay/sepay.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { ImageModule } from './modules/image/image.module';

dotenv.config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
      autoLoadEntities: true,
    }),
    AuthModule,
    CustomPackageRegistrationModule,
    UserModule,
    UserPackageModule,
    SepayModule,
    DashboardModule,
    ExchangeRateModule,
    ImageModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
