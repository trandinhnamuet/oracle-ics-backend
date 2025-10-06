import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Use cookie parser
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Enable CORS for frontend
  const corsOptions: CorsOptions = {
    origin: [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://oracle-ics-frontend.vercel.app',
  'https://oraclecloud.vn',
  'http://oraclecloud.vn',
  'https://smartdashboard.vn',
  'http://smartdashboard.vn',
],
    credentials: true,
  };
  app.enableCors(corsOptions);

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
}
bootstrap();
