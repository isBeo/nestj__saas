# 📅 Day 7 — DevOps, Docker, CI/CD, Testing & Production Deployment
### EduSaas Nigeria | Ship It Like a Senior Engineer

---

## 🎯 Day 7 Goals
- [ ] Understand Docker and containerization deeply
- [ ] Write production Dockerfiles for API and Web
- [ ] Configure Docker Compose for local dev
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Write unit and integration tests
- [ ] Configure environment management
- [ ] Set up logging and monitoring
- [ ] Understand production deployment strategies
- [ ] Write the VERSIONING and CHANGELOG docs

---

## 🧠 Concept: Why Docker?

The classic developer problem:

```
Dev: "It works on my machine!"
Production: "Your machine isn't the server."
```

Docker solves this by packaging your app **with its exact environment** — OS libraries, Node version, dependencies — into a portable **container**.

```
Without Docker:
  Your laptop: Node 20, Ubuntu 22
  Production: Node 18, CentOS 7
  → Different behavior, mysterious bugs

With Docker:
  Your laptop: [Docker Container: Node 20, Ubuntu 22]
  Production: [Docker Container: Node 20, Ubuntu 22]
  → Identical environment everywhere, every time
```

### Container vs Virtual Machine

```
Virtual Machine:          Docker Container:
┌──────────────┐         ┌──────────────┐
│   Your App   │         │   Your App   │
├──────────────┤         ├──────────────┤
│  OS (Ubuntu) │         │  Node + libs │   ← Only what you need
├──────────────┤         ├──────────────┤
│  Hypervisor  │         │ Docker Engine│   ← Shared OS kernel
└──────────────┘         └──────────────┘
Size: 1-20GB             Size: 50-500MB
Startup: minutes         Startup: seconds
```

---

## 🐳 Step 1 — Production Dockerfile (NestJS API)

```dockerfile
# apps/api/Dockerfile

# ─── STAGE 1: Dependencies ──────────────────────────────────
# We use multi-stage builds to keep the final image small
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy only package files first (Docker layer caching trick)
# If package.json hasn't changed, Docker reuses the cached layer
# → Much faster rebuilds when only source code changes
COPY package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --frozen-lockfile --prod


# ─── STAGE 2: Builder ───────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy all workspace files
COPY . .

# Install ALL deps (including devDeps for building)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter api exec prisma generate

# Build the TypeScript application
RUN pnpm --filter api build


# ─── STAGE 3: Production Runner ─────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

# Copy only what's needed to run
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Logs directory (writable by app user)
RUN mkdir -p logs && chown nestjs:nodejs logs

USER nestjs

EXPOSE 3001

# Health check so orchestrators know when app is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]
```

```dockerfile
# apps/web/Dockerfile

# ─── STAGE 1: Dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile


# ─── STAGE 2: Builder ───────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build environment vars (needed at build time for Next.js)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

RUN pnpm --filter web build


# ─── STAGE 3: Production Runner ─────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

WORKDIR /app

# Copy Next.js standalone output (includes only needed files)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

---

## 🐙 Step 2 — Docker Compose (Local Dev + Production)

```yaml
# docker-compose.yml (local development)
version: '3.9'

services:
  # ─── Infrastructure ─────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: edusaas_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-edusaas}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-edusaas123}
      POSTGRES_DB: ${POSTGRES_DB:-edusaas_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-edusaas}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: edusaas_redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD:-redis123}
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis123}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Dev Tools ───────────────────────────────────────────────
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: edusaas_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL:-admin@edusaas.ng}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:-admin}
    ports:
      - "5050:80"
    depends_on:
      postgres:
        condition: service_healthy
    profiles:
      - tools  # Only start with: docker-compose --profile tools up

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: edusaas_redis_ui
    environment:
      REDIS_HOSTS: "local:redis:6379:0:${REDIS_PASSWORD:-redis123}"
    ports:
      - "8081:8081"
    depends_on:
      - redis
    profiles:
      - tools

volumes:
  postgres_data:
  redis_data:
```

```yaml
# docker-compose.prod.yml (production)
version: '3.9'

services:
  api:
    image: edusaas/api:${IMAGE_TAG:-latest}
    container_name: edusaas_api
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  web:
    image: edusaas/web:${IMAGE_TAG:-latest}
    container_name: edusaas_web
    restart: always
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
      NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL}
    ports:
      - "3000:3000"
    depends_on:
      - api
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'

  nginx:
    image: nginx:alpine
    container_name: edusaas_nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - web
```

---

## ⚙️ Step 3 — Nginx Reverse Proxy Config

```nginx
# docker/nginx/nginx.conf
events {
  worker_connections 1024;
}

http {
  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # Gzip compression
  gzip on;
  gzip_vary on;
  gzip_min_length 1024;
  gzip_types text/plain text/css application/json application/javascript;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

  # Next.js frontend
  server {
    listen 80;
    server_name edusaas.ng www.edusaas.ng;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name edusaas.ng www.edusaas.ng;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Frontend (Next.js)
    location / {
      proxy_pass http://web:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }

    # API routes
    location /api/ {
      limit_req zone=api burst=20 nodelay;
      proxy_pass http://api:3001;
      proxy_http_version 1.1;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header Host $host;
    }

    # WebSocket (Socket.IO)
    location /socket.io/ {
      proxy_pass http://api:3001;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header X-Real-IP $remote_addr;
    }
  }
}
```

---

## 🔬 Step 4 — Health Check Endpoint

```typescript
// apps/api/src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — used by Docker, load balancers, CI' })
  async check() {
    const checks = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,  // DB connectivity
      this.redis.get('health:ping'),     // Redis connectivity
    ]);

    const db = checks[0].status === 'fulfilled';
    const cache = checks[1].status === 'fulfilled';
    const allHealthy = db && cache;

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: db ? 'ok' : 'error',
        cache: cache ? 'ok' : 'error',
      },
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV,
    };
  }
}
```

---

## 🧪 Step 5 — Testing Strategy

### Unit Tests (Service Layer)

```typescript
// apps/api/src/modules/auth/services/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../../common/redis/redis.service';
import { OtpService } from './otp.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// Mock PrismaService — we don't want to hit a real DB in unit tests
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deviceSession: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  sessionKey: jest.fn((id) => `session:${id}`),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  verify: jest.fn(),
};

const mockOtpService = {
  sendOtp: jest.fn().mockResolvedValue(undefined),
  verifyOtp: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: OtpService, useValue: mockOtpService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  // ─── REGISTER ─────────────────────────────────────────────
  describe('register()', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'SecurePass@123',
      firstName: 'Test',
      lastName: 'User',
      role: 'STUDENT' as any,
    };

    it('should create a user and send OTP on valid registration', async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null); // No existing user
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-123',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role,
        createdAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
        select: { id: true },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith(
        'user-123', registerDto.email, 'EMAIL_VERIFY',
      );
      expect(result.message).toContain('verify your email');
    });

    it('should throw ConflictException if email already exists', async () => {
      // Arrange — simulate existing user
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      // Act & Assert
      await expect(service.register(registerDto))
        .rejects
        .toThrow(ConflictException);

      // Make sure we didn't try to create the user
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── LOGIN ────────────────────────────────────────────────
  describe('login()', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'SecurePass@123',
      deviceId: 'device-abc',
      deviceName: 'Chrome on Windows',
    };

    it('should return tokens on valid credentials', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: loginDto.email,
        password: hashedPassword,
        role: 'STUDENT',
        isEmailVerified: true,
        isActive: true,
        isSuspended: false,
        firstName: 'Test',
        lastName: 'User',
        managedSchoolId: null,
        deviceSession: null, // No existing session
      });

      mockRedisService.get.mockResolvedValue(null);
      mockPrismaService.deviceSession.upsert.mockResolvedValue({});
      mockPrismaService.user.update.mockResolvedValue({});

      // Act
      const result = await service.login(loginDto, '127.0.0.1', 'Chrome/120');

      // Assert
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(result.data.user.email).toBe(loginDto.email);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: loginDto.email,
        password: await bcrypt.hash('different-password', 10),
        role: 'STUDENT',
        isEmailVerified: true,
        isActive: true,
        isSuspended: false,
        deviceSession: null,
      });

      // Act & Assert
      await expect(service.login(loginDto, '127.0.0.1', 'Chrome'))
        .rejects
        .toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto, '127.0.0.1', 'Chrome'))
        .rejects
        .toThrow(UnauthorizedException);
    });
  });
});
```

### Integration Tests (E2E)

```typescript
// apps/api/test/auth.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({ where: { email: { contains: 'e2e-test' } } });
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass@123',
          firstName: 'E2E',
          lastName: 'Test',
          role: 'STUDENT',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e-test@example.com');
      expect(res.body.data).not.toHaveProperty('password'); // Never expose password
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e-test@example.com', // Same email
          password: 'SecurePass@123',
          firstName: 'E2E',
          lastName: 'Test',
          role: 'STUDENT',
        })
        .expect(409); // Conflict
    });

    it('should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass@123',
          firstName: 'E2E',
          lastName: 'Test',
          role: 'STUDENT',
        })
        .expect(400); // Bad request
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'another@example.com',
          password: '12345678',  // No uppercase, special char
          firstName: 'Test',
          lastName: 'User',
          role: 'STUDENT',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should reject login for unverified email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e-test@example.com',
          password: 'SecurePass@123',
          deviceId: 'test-device-001',
        })
        .expect(403); // Forbidden — email not verified

      expect(res.body.message).toContain('verify your email');
    });
  });
});
```

### Jest Config

```typescript
// apps/api/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  coveragePathIgnorePatterns: [
    'node_modules',
    'main.ts',
    '.module.ts',
    '.dto.ts',
  ],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  coverageThresholds: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

export default config;
```

---

## 🚀 Step 6 — GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: EduSaas CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '8'

jobs:
  # ─── JOB 1: Lint & Type Check ────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run lint
        run: pnpm lint

      - name: TypeScript type check
        run: pnpm --filter api exec tsc --noEmit

  # ─── JOB 2: Unit Tests ───────────────────────────────────
  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: edusaas
          POSTGRES_PASSWORD: edusaas123
          POSTGRES_DB: edusaas_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Set up test environment
        run: |
          cp apps/api/.env.example apps/api/.env.test
          echo "DATABASE_URL=postgresql://edusaas:edusaas123@localhost:5432/edusaas_test" >> apps/api/.env.test
          echo "REDIS_URL=redis://localhost:6379" >> apps/api/.env.test
          echo "JWT_SECRET=test-jwt-secret-that-is-at-least-32-chars-long" >> apps/api/.env.test
          echo "JWT_REFRESH_SECRET=test-refresh-secret-at-least-32-chars" >> apps/api/.env.test
        env:
          NODE_ENV: test

      - name: Run Prisma migrations
        run: pnpm --filter api exec prisma migrate deploy
        env:
          DATABASE_URL: postgresql://edusaas:edusaas123@localhost:5432/edusaas_test

      - name: Run unit tests with coverage
        run: pnpm --filter api test:cov
        env:
          NODE_ENV: test

      - name: Upload coverage report
        uses: codecov/codecov-action@v4
        with:
          files: apps/api/coverage/lcov.info
          flags: api-unit-tests

  # ─── JOB 3: Build Docker Images ──────────────────────────
  build:
    name: Build & Push Docker Images
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'  # Only on main branch

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata (tags, labels)
        id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: edusaas/api
          tags: |
            type=sha,prefix=git-
            type=raw,value=latest

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push Web image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: edusaas/web:latest,edusaas/web:git-${{ github.sha }}
          build-args: |
            NEXT_PUBLIC_API_URL=https://api.edusaas.ng/api
            NEXT_PUBLIC_WS_URL=wss://api.edusaas.ng
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── JOB 4: Deploy to Production ─────────────────────────
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production  # Requires manual approval in GitHub UI

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_SERVER_IP }}
          username: ${{ secrets.PROD_SERVER_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/edusaas
            
            # Pull latest images
            docker-compose -f docker-compose.prod.yml pull
            
            # Run migrations before restarting
            docker-compose -f docker-compose.prod.yml run --rm api \
              node -e "require('./dist/main').runMigrations()"
            
            # Rolling restart (zero-downtime)
            docker-compose -f docker-compose.prod.yml up -d --no-deps api
            docker-compose -f docker-compose.prod.yml up -d --no-deps web
            
            # Cleanup old images
            docker image prune -f
            
            echo "✅ Deployment complete: $(date)"

      - name: Health check after deploy
        run: |
          sleep 30  # Wait for app to start
          curl -f https://api.edusaas.ng/api/health || exit 1
          echo "✅ Health check passed"
```

---

## 🔐 Step 7 — Environment Management

```bash
# .env.example (committed to git — template, no real values)
# ─── App ──────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# ─── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
POSTGRES_USER=edusaas
POSTGRES_PASSWORD=changeme
POSTGRES_DB=edusaas_db

# ─── Redis ────────────────────────────────────────────────
REDIS_URL=redis://:PASSWORD@localhost:6379
REDIS_PASSWORD=changeme

# ─── JWT ──────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_32_CHARS_MINIMUM_VERY_SECURE
JWT_EXPIRY=15m
JWT_REFRESH_SECRET=CHANGE_ME_REFRESH_32_CHARS_MIN
JWT_REFRESH_EXPIRY=7d

# ─── OTP ──────────────────────────────────────────────────
OTP_EXPIRY_MINUTES=5

# ─── SMS (Termii) ─────────────────────────────────────────
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=EduSaas

# ─── Identity Verification ────────────────────────────────
PREMBLY_API_KEY=your_prembly_key
PREMBLY_APP_ID=your_app_id

# ─── Email (SMTP) ─────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=noreply@edusaas.ng
```

```bash
# GitHub Actions Secrets to configure:
# Settings → Secrets and variables → Actions → New repository secret

DOCKER_USERNAME          # Docker Hub username
DOCKER_PASSWORD          # Docker Hub password or token
PROD_SERVER_IP           # Your production server IP
PROD_SERVER_USER         # SSH user (usually 'ubuntu' or 'root')
PROD_SSH_KEY             # Private SSH key for server access
DATABASE_URL             # Production database URL
REDIS_URL                # Production Redis URL
JWT_SECRET               # Production JWT secret
JWT_REFRESH_SECRET       # Production refresh secret
```

---

## 📋 Step 8 — VERSIONING.md

```markdown
# EduSaas Versioning Strategy

## Semantic Versioning (SemVer)

We use: MAJOR.MINOR.PATCH

| Type  | When | Example |
|-------|------|---------|
| PATCH | Bug fixes, small tweaks | 1.0.0 → 1.0.1 |
| MINOR | New features (backward compatible) | 1.0.0 → 1.1.0 |
| MAJOR | Breaking changes | 1.0.0 → 2.0.0 |

## Branch Strategy

```
main          ← Production-ready code (auto-deploys)
  └── develop ← Integration branch (all features merge here)
        └── feature/auth-otp        ← Feature branches
        └── feature/student-enroll
        └── fix/login-race-condition
        └── hotfix/security-patch   ← Urgent fixes (merge to main + develop)
```

## Commit Message Convention (Conventional Commits)

```
<type>(<scope>): <description>

feat(auth): add OTP verification for email
fix(students): correct pagination offset calculation
docs(readme): update setup instructions
chore(deps): upgrade prisma to 5.8.0
perf(results): add index on studentId+termId
security(auth): rate limit login endpoint
test(students): add enrollment integration tests
refactor(repository): extract base pagination logic
```

## Release Process

1. Create PR: `develop → main`
2. GitHub Actions runs full CI suite
3. Requires 1 reviewer approval
4. Merge triggers auto-deployment
5. Tag the release: `git tag v1.2.0`
6. Update CHANGELOG.md
```

---

## 📋 Step 9 — CHANGELOG.md

```markdown
# Changelog

All notable changes to EduSaas are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

### Planned
- CBT exam engine with timer
- SMS notifications via Termii
- Parent portal mobile responsiveness
- PDF report card generation
- Bulk student import via Excel

---

## [1.0.0] — 2024-02-01

### 🎉 Initial Release

#### Added
- **Authentication System**
  - Register, Login, Logout
  - Email verification with OTP
  - Forgot/Reset password flow
  - JWT + Refresh token rotation
  - One-device-per-user enforcement
  - Security recovery via NIN/BVN

- **Role-Based Access Control**
  - SUPER_ADMIN: Full platform access
  - SCHOOL_ADMIN: Full school management
  - TEACHER: Class, subjects, results
  - STUDENT: Own data, exam access
  - PARENT: Child's data, billing

- **School Management**
  - Multi-school SaaS architecture
  - School CRUD with soft delete
  - School settings and grading system
  - Academic sessions and terms

- **Student Management**
  - Student enrollment with auto admission numbers
  - Classroom assignment and transfer
  - Parent-student linking
  - Student statistics dashboard

- **Teacher Management**
  - Teacher onboarding with auto staff IDs
  - Subject assignment per classroom
  - Form teacher designation

- **Results & Grading**
  - CA and exam score entry
  - Automatic grade calculation
  - Class position ranking
  - Result publication with notifications

- **Security**
  - Helmet HTTP security headers
  - Rate limiting (global + per-endpoint)
  - Audit logging for all mutations
  - Soft deletes (no data is truly deleted)
  - Input validation and sanitization

- **Infrastructure**
  - Docker + Docker Compose
  - GitHub Actions CI/CD
  - Nginx reverse proxy
  - PostgreSQL + Redis
  - Swagger API documentation
  - Winston structured logging

#### Technical Stack
- Backend: NestJS + Prisma + PostgreSQL + Redis
- Frontend: Next.js 14 + TypeScript + Tailwind + shadcn/ui
- DevOps: Docker + GitHub Actions + Nginx

---

## Development Roadmap

### v1.1.0 (Q2 2024)
- CBT exam module with timer
- Real-time exam monitoring
- Question bank management

### v1.2.0 (Q3 2024)
- Paystack/Flutterwave billing integration
- Invoice management
- Payment receipts

### v1.3.0 (Q4 2024)
- Attendance tracking with QR codes
- SMS notifications (Termii)
- Mobile app (React Native)

### v2.0.0 (2025)
- AI-powered result analysis
- Predictive performance alerts
- Custom report builder
```

---

## 🏗️ Production Deployment Checklist

```bash
# On your production server (Ubuntu 22.04)

# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Clone the repo (or pull from your server)
git clone https://github.com/your-org/edusaas.git /opt/edusaas
cd /opt/edusaas

# 4. Set up production env
cp .env.example .env
nano .env  # Fill in all production values

# 5. Start services
docker-compose -f docker-compose.prod.yml up -d

# 6. Run migrations
docker-compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy

# 7. Seed initial data
docker-compose -f docker-compose.prod.yml exec api \
  node dist/prisma/seed.js

# 8. Set up SSL with Certbot (Let's Encrypt — free SSL)
sudo apt install certbot
sudo certbot certonly --standalone -d api.edusaas.ng -d edusaas.ng

# Copy certs to nginx volume
sudo cp /etc/letsencrypt/live/edusaas.ng/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/edusaas.ng/privkey.pem docker/nginx/ssl/

# 9. Restart nginx with SSL
docker-compose -f docker-compose.prod.yml restart nginx

# 10. Verify everything is running
docker-compose -f docker-compose.prod.yml ps
curl https://api.edusaas.ng/api/health
```

---

## 🎯 Final Architecture Diagram

```
Internet
    │
    ▼
[Nginx :443]  ← SSL termination, rate limiting, routing
    ├─────────────────────────────────────┐
    │                                     │
    ▼                                     ▼
[Next.js :3000]                    [NestJS API :3001]
  Server Components                       │
  Client Components             ┌─────────┼──────────┐
  Zustand + React Query         │         │          │
  WebSocket client              ▼         ▼          ▼
                           [Prisma]   [Redis]   [BullMQ]
                               │         │    (job queues)
                               ▼         │
                        [PostgreSQL]   (sessions,
                          :5432       OTPs, cache,
                                      rate limits)
```

---

## 📝 Day 7 Checklist

- [ ] Dockerfile for API (multi-stage, non-root user, health check)
- [ ] Dockerfile for Web (Next.js standalone output)
- [ ] Docker Compose for local dev (postgres, redis, pgadmin)
- [ ] Docker Compose for production
- [ ] Nginx reverse proxy with SSL, gzip, rate limiting
- [ ] Health check endpoint with DB + Redis status
- [ ] Unit tests for AuthService
- [ ] E2E tests for auth endpoints
- [ ] Jest config with coverage thresholds
- [ ] GitHub Actions CI (lint → test → build → deploy)
- [ ] .env.example template
- [ ] GitHub Secrets documented
- [ ] Production server setup commands
- [ ] SSL with Let's Encrypt
- [ ] VERSIONING.md
- [ ] CHANGELOG.md

---

## 🏆 What You've Built This Week

| Day | Achievement |
|-----|-------------|
| Day 1 | Monorepo, concepts, tooling, Docker dev environment |
| Day 2 | Complete 20-table relational database with Prisma |
| Day 3 | Production NestJS app with full auth system |
| Day 4 | One-device security, identity verification, WebSockets |
| Day 5 | 4 core modules with Repository Pattern, RBAC, pagination |
| Day 6 | Complete Next.js frontend with real-time features |
| Day 7 | Docker, CI/CD, tests, SSL, production deployment |

**You now have the architecture knowledge to:**
- Work at a senior level on any NestJS or Next.js project
- Design multi-tenant SaaS systems
- Implement enterprise security patterns
- Set up production-grade DevOps pipelines
- Explain every technical decision in a job interview

**You are employable. Ship it. 🚀**

---

*EduSaas Nigeria — Built with ❤️ for Nigerian Schools*
```

---

*End of 7-Day Sprint — Congratulations, Engineer!*
