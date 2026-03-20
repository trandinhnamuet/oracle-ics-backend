import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';

// Load env vars BEFORE bootstrap
dotenv.config();

// Debug: Check env vars loaded
console.log('📝 Environment check:');
console.log(`DB_HOST: ${process.env.DB_HOST}`);
console.log(`DB_PORT: ${process.env.DB_PORT}`);
console.log(`DB_USERNAME: ${process.env.DB_USERNAME}`);
console.log(`DB_NAME: ${process.env.DB_NAME}`);
console.log(`DB_PASSWORD: ${process.env.DB_PASSWORD ? '***' : 'NOT SET'}`);
console.log('');

async function bootstrap() {
  try {
    console.log('🔄 Initializing database...');
    await AppDataSource.initialize();
    console.log('✅ Database initialized');
    
    console.log('🔄 Running migrations...');
    await AppDataSource.runMigrations();
    console.log('✅ Migrations completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }

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
      'http://admin.oraclecloud.vn',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  };
  app.enableCors(corsOptions);

  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
}
bootstrap();
