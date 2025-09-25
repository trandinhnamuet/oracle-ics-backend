import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const app = await NestFactory.create(AppModule);

  // Use cookie parser
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Enable CORS for all origins
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // const port = process.env.PORT ?? 3003;
  const port = 3001
  await app.listen(port);
  console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
}
bootstrap();
