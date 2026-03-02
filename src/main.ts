import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';

async function bootstrap() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  // Disable built-in body parser so we can set higher limits.
  // json() and urlencoded() only process their own content-types and
  // skip multipart/form-data, so file uploads are unaffected.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  // Trust proxy - CRITICAL for getting real IP behind nginx/load balancer
  // This tells Express to trust the X-Forwarded-* headers
  app.set('trust proxy', true);

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Use cookie parser
  app.use(cookieParser());

  // Global class serializer interceptor for transforming DTOs
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Global validation pipe with transformers
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
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
  'https://admin.oraclecloud.vn',

],
    credentials: true,
  };
  app.enableCors(corsOptions);

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
}
bootstrap();
