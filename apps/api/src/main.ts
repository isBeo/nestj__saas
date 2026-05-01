import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { winstonConfig } from './config/winston.config';
import { env } from './config/env.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
    bufferLogs: true,
  });

  // ─── Trust proxy (important for Nginx/load balancers) ───
  app.set('trust proxy', 1);

  // ─── Security ───────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // Needed for Swagger UI
    }),
  );

  // ─── CORS ────────────────────────────────────────────────
  app.enableCors({
    origin: [env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  });

  // ─── Compression ─────────────────────────────────────────
  app.use(compression()); // Gzip responses - smaller payloads

  // ─── Cookie Parser ────────────────────────────────────────
  app.use(cookieParser());

  // ─── API Prefix & Versioning ─────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI }); // /api/v1/auth/login

  // ─── Global Validation Pipe ──────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true, // Auto-convert types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global Interceptors ─────────────────────────────────
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseTransformInterceptor(),
  );

  // ─── Global Exception Filter ─────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Swagger API Documentation ───────────────────────────
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('EduSaas API')
      .setDescription('🏫 EduSaas Nigeria - School Management System API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Schools', 'School management')
      .addTag('Students', 'Student management')
      .addTag('Exams', 'Exam & CBT management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // Remember JWT in Swagger UI
      },
    });

    console.log(`📚 Swagger docs: http://localhost:${env.PORT}/api/docs`);
  }

  await app.listen(env.PORT);
  console.log(`🚀 EduSaas API running on http://localhost:${env.PORT}/api`);
  console.log(`🌍 Environment: ${env.NODE_ENV}`);
}

void bootstrap();
