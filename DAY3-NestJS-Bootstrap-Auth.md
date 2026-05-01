# 📅 Day 3 — NestJS Bootstrap, Configuration & Full Auth System
### EduSaas Nigeria | Production-Grade Authentication

---

## 🎯 Day 3 Goals
- [ ] Bootstrap the NestJS app with global config
- [ ] Set up Winston logging
- [ ] Set up Swagger API docs
- [ ] Set up Helmet, CORS, rate limiting
- [ ] Build the complete Auth module (Register, Login, Logout)
- [ ] Build JWT + Refresh Token system
- [ ] Build Role-Based Access Control (RBAC) guards
- [ ] Build email verification with OTP
- [ ] Build forgot password flow
- [ ] Understand every pattern used

---

## 🧠 Concept: The Request Lifecycle in NestJS

Before we write a single auth line, understand what happens when a request hits your API:

```
Incoming HTTP Request
        │
        ▼
  [ Middleware ]          ← Logger, IP check, body parsing
        │
        ▼
    [ Guards ]            ← Is user authenticated? Has role?
        │
        ▼
  [ Interceptors ]        ← Before: start timer. After: format response
        │
        ▼
     [ Pipes ]            ← Validate & transform body (DTOs)
        │
        ▼
  [ Controller ]          ← Route handler, calls service
        │
        ▼
   [ Service ]            ← Business logic, calls repository
        │
        ▼
  [ Repository ]          ← Database call via Prisma
        │
        ▼
   [ Response ]           ← Interceptor formats it, sent to client
```

💡 **WHY this matters**: If your Guard rejects the request, the Controller never runs. If the Pipe rejects the DTO, the Controller never runs. This is **defense in depth** — multiple layers of protection.

---

## 🚀 Step 1 — Main Bootstrap File

```typescript
// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
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
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // Needed for Swagger UI
  }));

  // ─── CORS ────────────────────────────────────────────────
  app.enableCors({
    origin: [env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,                    // Allow cookies
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
      whitelist: true,             // Strip unknown fields
      forbidNonWhitelisted: true,  // Throw on unknown fields
      transform: true,             // Auto-convert types
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

bootstrap();
```

---

## 🔧 Step 2 — Environment Config (Typed + Validated)

```typescript
// apps/api/src/config/env.config.ts
import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),

  // SMS (Termii)
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('EduSaas'),

  // Identity Verification
  PREMBLY_API_KEY: z.string().optional(),
  PREMBLY_APP_ID: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@edusaas.ng'),
});

// Validate at startup — crash early if env is wrong
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1); // Kill the process — do not start with bad config
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
```

---

## 📝 Step 3 — Winston Logging Config

```typescript
// apps/api/src/config/winston.config.ts
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, context, ...meta }) => {
    const ctx = context ? `[${context}]` : '';
    const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} ${level} ${ctx} ${message} ${extra}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  json(), // JSON logs for log aggregation services (Datadog, Loki)
);

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    // In production, add file transports or remote transports
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
};
```

---

## 🛡️ Step 4 — Common: Exception Filter

```typescript
// apps/api/src/common/filters/http-exception.filter.ts
import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = typeof res === 'string' ? res : res.message;
      errors = typeof res === 'object' ? res.errors : undefined;

    } else if (exception instanceof PrismaClientKnownRequestError) {
      // Handle Prisma-specific errors gracefully
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = `A record with this ${(exception.meta?.target as string[])?.join(', ')} already exists`;
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        default:
          message = 'Database error';
      }
    } else {
      // Unknown errors — log them but don't expose details to client
      this.logger.error('Unhandled exception', {
        exception,
        path: request.url,
        method: request.method,
      });
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
```

💡 **WHY catch Prisma errors?**: Without this, a duplicate email insert would return a cryptic `500 Internal Server Error` with a Prisma stack trace. With this filter, it returns a clean `409 Conflict: A record with this email already exists`.

---

## 🔄 Step 5 — Response Transform Interceptor

```typescript
// apps/api/src/common/interceptors/response-transform.interceptor.ts
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>> {

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the service returns { data, message }, extract them
        if (data && typeof data === 'object' && 'data' in data) {
          return {
            success: true,
            message: data.message,
            data: data.data,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
```

---

## 🔐 Step 6 — Auth Module: Full Implementation

### DTOs

```typescript
// apps/api/src/modules/auth/dto/register.dto.ts
import {
  IsEmail, IsString, MinLength, MaxLength,
  IsEnum, IsOptional, Matches, IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsOptional()
  @Matches(/^\+234[0-9]{10}$/, { message: 'Phone must be a valid Nigerian number (+234XXXXXXXXXX)' })
  phone?: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password must contain uppercase, lowercase, number and special character' }
  )
  password: string;

  @ApiProperty({ example: 'Chidi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Okonkwo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'SCHOOL_ADMIN', enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: 'school-id-here', required: false })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
```

```typescript
// apps/api/src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'device-uuid-here', description: 'Unique device identifier' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ example: 'Chrome on Windows 11', required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
```

```typescript
// apps/api/src/modules/auth/dto/forgot-password.dto.ts
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail()
  email: string;
}

// apps/api/src/modules/auth/dto/reset-password.dto.ts
import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;

  @ApiProperty({ example: 'chidi@example.com' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'NewSecurePass@123' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password too weak',
  })
  newPassword: string;
}

// apps/api/src/modules/auth/dto/verify-otp.dto.ts
import { IsString, IsEmail, IsIn } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;

  @IsIn(['EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET'])
  purpose: string;
}
```

---

### Auth Service

```typescript
// apps/api/src/modules/auth/services/auth.service.ts
import {
  Injectable, UnauthorizedException, ConflictException,
  BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/services/redis.service';
import { OtpService } from './otp.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { env } from '../../../config/env.config';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12; // Higher = more secure, slower

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private otpService: OtpService,
  ) {}

  // ─────────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    // 1. Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Hash password (never store plaintext!)
    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // 3. Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
      select: {
        id: true, email: true, firstName: true,
        lastName: true, role: true, createdAt: true,
      },
    });

    // 4. Send email verification OTP
    await this.otpService.sendOtp(user.id, user.email, 'EMAIL_VERIFY');

    this.logger.log(`New user registered: ${user.email} [${user.role}]`);

    return {
      data: user,
      message: 'Registration successful. Please verify your email.',
    };
  }

  // ─────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────
  async login(dto: LoginDto, ipAddress: string, userAgent: string) {
    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true, email: true, password: true, role: true,
        isEmailVerified: true, isActive: true, isSuspended: true,
        firstName: true, lastName: true, managedSchoolId: true,
        deviceSession: true,
      },
    });

    if (!user) {
      // ⚠️ SECURITY: Don't say "user not found" — say "invalid credentials"
      // This prevents user enumeration attacks
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Check password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Check account status
    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    if (user.isSuspended) {
      throw new ForbiddenException('Your account has been suspended. Contact support.');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    // 4. ── ONE DEVICE LOGIN CHECK ──────────────────────────
    if (user.deviceSession && user.deviceSession.isActive) {
      const existingDeviceId = user.deviceSession.deviceId;

      if (existingDeviceId !== dto.deviceId) {
        // Different device trying to login — REJECT
        throw new ForbiddenException({
          message: 'This account is already active on another device.',
          code: 'DEVICE_CONFLICT',
          // Frontend uses this code to show the "Identity Verification" flow
        });
      }
    }

    // 5. Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // 6. Save/Update device session
    await this.prisma.deviceSession.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        deviceType: this.detectDeviceType(userAgent),
        ipAddress,
        userAgent,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      update: {
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        ipAddress,
        userAgent,
        refreshToken: tokens.refreshToken,
        isActive: true,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 7. Cache active session in Redis (fast lookup)
    await this.redis.set(
      `session:${user.id}`,
      JSON.stringify({ deviceId: dto.deviceId, role: user.role }),
      86400, // 24 hours
    );

    // 8. Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    this.logger.log(`User logged in: ${user.email} from ${ipAddress}`);

    return {
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          schoolId: user.managedSchoolId,
        },
      },
      message: 'Login successful',
    };
  }

  // ─────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────
  async logout(userId: string) {
    // 1. Invalidate device session in DB
    await this.prisma.deviceSession.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // 2. Remove from Redis
    await this.redis.del(`session:${userId}`);
    await this.redis.del(`refresh:${userId}`);

    this.logger.log(`User logged out: ${userId}`);

    return { data: null, message: 'Logged out successfully' };
  }

  // ─────────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    // 1. Verify refresh token
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Validate against DB (token rotation security)
    const session = await this.prisma.deviceSession.findFirst({
      where: {
        userId: payload.sub,
        refreshToken,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      // Token reuse detected — revoke all sessions (security response)
      await this.prisma.deviceSession.updateMany({
        where: { userId: payload.sub },
        data: { isActive: false },
      });
      throw new UnauthorizedException('Session expired. Please login again.');
    }

    // 3. Get user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or deactivated');
    }

    // 4. Token rotation — issue new tokens, invalidate old refresh token
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.prisma.deviceSession.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        lastSeenAt: new Date(),
      },
    });

    return {
      data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      message: 'Token refreshed',
    };
  }

  // ─────────────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });

    // ⚠️ SECURITY: Always return the same message whether user exists or not
    // Prevents email enumeration attacks
    const response = { data: null, message: 'If this email exists, you will receive a reset OTP' };

    if (!user) return response;

    await this.otpService.sendOtp(user.id, user.email, 'PASSWORD_RESET');

    return response;
  }

  // ─────────────────────────────────────────────────────
  // RESET PASSWORD
  // ─────────────────────────────────────────────────────
  async resetPassword(email: string, otp: string, newPassword: string) {
    // 1. Verify OTP
    await this.otpService.verifyOtp(email, otp, 'PASSWORD_RESET');

    // 2. Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

    // 3. Update password
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // 4. Invalidate all sessions (force re-login on all devices)
    await this.prisma.deviceSession.updateMany({
      where: { user: { email } },
      data: { isActive: false },
    });

    return { data: null, message: 'Password reset successful. Please login.' };
  }

  // ─────────────────────────────────────────────────────
  // VERIFY EMAIL
  // ─────────────────────────────────────────────────────
  async verifyEmail(email: string, otp: string) {
    await this.otpService.verifyOtp(email, otp, 'EMAIL_VERIFY');

    await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });

    return { data: null, message: 'Email verified successfully' };
  }

  // ─────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────
  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: env.JWT_SECRET,
        expiresIn: env.JWT_EXPIRY,
      }),
      this.jwt.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRY,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private detectDeviceType(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
  }
}
```

---

### OTP Service

```typescript
// apps/api/src/modules/auth/services/otp.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { env } from '../../../config/env.config';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly MAX_ATTEMPTS = 3;

  constructor(private prisma: PrismaService) {}

  async sendOtp(userId: string, email: string, purpose: string): Promise<void> {
    // Invalidate any existing unused OTPs for this purpose
    await this.prisma.otpCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() }, // Mark as used
    });

    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { userId, code, purpose, expiresAt },
    });

    // TODO: In production, send via email/SMS
    // For dev, log it
    this.logger.debug(`OTP for ${email} [${purpose}]: ${code}`);

    // await this.emailService.sendOtpEmail(email, code, purpose);
  }

  async verifyOtp(email: string, code: string, purpose: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid OTP');
    }

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() }, // Not expired
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP expired or not found. Request a new one.');
    }

    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Request a new OTP.');
    }

    if (otpRecord.code !== code) {
      // Increment attempts
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(`Invalid OTP. ${this.MAX_ATTEMPTS - otpRecord.attempts - 1} attempts remaining.`);
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  }
}
```

---

### JWT Strategy (Passport)

```typescript
// apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/services/redis.service';
import { env } from '../../../config/env.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_SECRET,
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // Check Redis first (fast path — avoids DB hit on every request)
    const cachedSession = await this.redis.get(`session:${payload.sub}`);

    if (!cachedSession) {
      // Fallback to DB
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, role: true, managedSchoolId: true },
      });

      if (!user) {
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      return user;
    }

    const session = JSON.parse(cachedSession);
    return {
      id: payload.sub,
      email: payload.email,
      role: session.role,
    };
  }
}
```

---

### Guards

```typescript
// apps/api/src/common/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true; // Skip auth check

    return super.canActivate(context);
  }
}
```

```typescript
// apps/api/src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) return false;

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}`
      );
    }

    return true;
  }
}
```

---

### Decorators

```typescript
// apps/api/src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// apps/api/src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// apps/api/src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

---

### Auth Controller

```typescript
// apps/api/src/modules/auth/controllers/auth.controller.ts
import {
  Controller, Post, Body, Get, UseGuards,
  HttpCode, HttpStatus, Req, Res, Ip,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' }) // /api/v1/auth
@UseGuards(JwtAuthGuard) // Applied globally; individual routes can use @Public()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered, OTP sent to email' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, tokens returned' })
  @ApiResponse({ status: 403, description: 'Device conflict — account on another device' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout current session' })
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with OTP' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto.email, dto.otp);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getProfile(@CurrentUser() user: any) {
    return { data: user };
  }
}
```

---

### Auth Module Wiring

```typescript
// apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { env } from '../../config/env.config';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PassportModule,
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRY },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

---

### Redis Service

```typescript
// apps/api/src/common/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../../config/env.config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
```

---

### Rate Limiting Setup

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Rate limiting: max 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([{
      name: 'global',
      ttl: 60000,   // 60 seconds
      limit: 100,
    }]),

    PrismaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,  // Apply globally
    },
  ],
})
export class AppModule {}
```

---

## 🧪 Testing Auth Endpoints

Once the server is running, open Swagger at `http://localhost:3001/api/docs`

**Test flow:**
```
1. POST /api/v1/auth/register  → Get user created, OTP logged
2. POST /api/v1/auth/verify-email  → Verify email with logged OTP
3. POST /api/v1/auth/login  → Get access + refresh tokens
4. GET  /api/v1/auth/me  → Use access token in Swagger Authorize
5. POST /api/v1/auth/refresh  → Get new access token
6. POST /api/v1/auth/logout  → Session invalidated
```

---

## 📝 Day 3 Checklist

- [ ] `main.ts` bootstrapped with Helmet, CORS, Swagger, ValidationPipe
- [ ] Environment config validated with Zod at startup
- [ ] Winston logger configured
- [ ] Global HTTP exception filter handles Prisma + HTTP errors
- [ ] Response transform interceptor standardizes all responses
- [ ] Full Auth service: Register, Login, Logout, Refresh, ForgotPassword, ResetPassword
- [ ] OTP service for email verification and password reset
- [ ] JWT strategy with Redis session cache
- [ ] JwtAuthGuard + RolesGuard + `@Public()` decorator
- [ ] `@CurrentUser()` decorator for clean user extraction
- [ ] Rate limiting applied globally
- [ ] All auth endpoints tested via Swagger

---

## 🔑 Key Security Patterns Used Today

| Pattern | Why It Matters |
|---------|---------------|
| `bcrypt` with 12 rounds | Slow hashing defeats brute force |
| Generic error on wrong credentials | Prevents user enumeration |
| Generic error on forgot password | Prevents email enumeration |
| Token rotation on refresh | Detects token theft |
| OTP max attempts | Prevents OTP brute force |
| `whitelist: true` on ValidationPipe | Prevents mass assignment |
| Rate limiting | Prevents automated attacks |
| Soft deletes | Audit trail preserved |

---

*Next: Day 4 — One-Device Security System, Redis Deep Dive & Identity Verification*
