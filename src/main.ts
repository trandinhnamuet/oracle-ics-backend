import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { types as pgTypes } from 'pg';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';

// Load env vars BEFORE bootstrap
dotenv.config();

// ── Timezone fix ──────────────────────────────────────────────────────────────
// pg (node-postgres) mặc định diễn giải cột TIMESTAMP (không có timezone info)
// theo local timezone của Node.js process. Nếu server đặt TZ=Asia/Ho_Chi_Minh,
// pg sẽ đọc "2026-03-20 08:18:00" (UTC thực tế) thành 08:18 giờ VN = 01:18 UTC
// → kết quả API bị sai 7 tiếng.
// Fix: ép pg luôn đọc TIMESTAMP columns như UTC bất kể TZ của server.
pgTypes.setTypeParser(1114, (val: string) => new Date(val.replace(' ', 'T') + 'Z'))   // TIMESTAMP
pgTypes.setTypeParser(1184, (val: string) => new Date(val))                             // TIMESTAMPTZ
// ─────────────────────────────────────────────────────────────────────────────

// Debug: Check env vars loaded
console.log('📝 Environment check:');
console.log(`DB_HOST: ${process.env.DB_HOST ? '***' : 'NOT SET'}`);
console.log(`DB_PORT: ${process.env.DB_PORT ? '***' : 'NOT SET'}`);
console.log(`DB_USERNAME: ${process.env.DB_USERNAME ? '***' : 'NOT SET'}`);
console.log(`DB_NAME: ${process.env.DB_NAME ? '***' : 'NOT SET'}`);
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

  // Trust proxy - only trust first reverse proxy (nginx)
  app.set('trust proxy', 'loopback');

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res: any) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });

  // Use cookie parser
  app.use(cookieParser());

  // ── CSRF posture ──────────────────────────────────────────────────────────
  // The API is consumed primarily by SPA clients that authenticate with a
  // JWT Bearer token in the Authorization header. CSRF tokens are not needed
  // for those requests because attackers cannot forge custom Authorization
  // headers cross-origin (browsers block this without an explicit CORS opt-in).
  //
  // The only browser-managed credential we issue is the refresh-token cookie,
  // which is hardened against CSRF as follows:
  //   * httpOnly      → JavaScript on attacker pages cannot read it
  //   * secure (prod) → only sent over HTTPS
  //   * SameSite=Lax  → not sent on cross-site sub-resource requests; only
  //                     attached to top-level navigations to our own origin
  //   * domain pinned → restricted to the configured COOKIE_DOMAIN
  //
  // CORS is also locked to an explicit allow-list (see corsOptions below) so
  // that even if a malicious page attempted credentialed requests, the browser
  // would reject the response.
  //
  // If we ever introduce non-Bearer cookie-based session auth for state-
  // changing endpoints, add a double-submit-cookie or csurf middleware here.
  // ──────────────────────────────────────────────────────────────────────────

  // Security headers
  app.use(helmet());

  // Global class serializer interceptor for transforming DTOs
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Global validation pipe with transformers
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
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
