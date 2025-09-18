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

  // Enable CORS for frontend
  const corsOptions: CorsOptions = {
    origin: [
      'http://localhost:3000', 
      'http://localhost:5173',
      'https://oracle-ics-frontend.vercel.app'
    ],
    credentials: true,
  };
  app.enableCors(corsOptions);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
