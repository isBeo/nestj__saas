# 📅 Day 1 — Architecture, Core Concepts & Project Setup

### EduSaas Nigeria | TESLA Methodology

---

## 🎯 Day 1 Goals

- [ ] Understand NestJS core concepts
- [ ] Understand Prisma, Redis, Next.js concepts
- [ ] Set up the monorepo
- [ ] Configure TypeScript, ESLint, Prettier
- [ ] Initialize NestJS and Next.js apps
- [ ] Set up Docker Compose for local dev

---

## 🧠 CRASH COURSE — Concepts Before Code

> ⚠️ **BEGINNER MISTAKE**: Most students skip this and dive into code. Then they get lost when something doesn't work because they don't understand _why_ things are structured the way they are.

---

## 🟦 NestJS Concepts

NestJS is a **framework built on top of Express** (or Fastify) that adds:

- Strong structure inspired by Angular
- Dependency Injection (DI)
- TypeScript-first design
- Built-in support for modules, guards, pipes, interceptors

Think of it like this:

- **Express** = a kitchen with raw ingredients
- **NestJS** = a fully equipped restaurant with a chef hierarchy

---

### 1. Modules

A **Module** is a logical grouping of related code.

```typescript
// auth.module.ts
@Module({
  imports: [JwtModule, PrismaModule], // other modules this needs
  controllers: [AuthController], // handles HTTP requests
  providers: [AuthService, AuthGuard], // business logic & helpers
  exports: [AuthService], // what others can import
})
export class AuthModule {}
```

💡 **WHY**: Instead of one giant file, each feature (Auth, Students, Exams) lives in its own module. This makes the codebase navigable. When you join a company, you look at the `modules/` folder to understand what the app does.

---

### 2. Controllers

A **Controller** handles incoming HTTP requests and returns responses.

```typescript
@Controller("auth") // base route: /auth
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login") // POST /auth/login
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("profile") // GET /auth/profile
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }
}
```

💡 **WHY**: Controllers should be THIN — they just receive the request and hand it to the service. **No business logic in controllers.** This is the #1 pattern violation beginners make.

---

### 3. Providers / Services

A **Service** contains your actual business logic.

```typescript
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
  ) {}

  async login(dto: LoginDto) {
    // 1. Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // 2. Verify password
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    // 3. Generate token
    return { token: this.jwt.sign({ sub: user.id, role: user.role }) };
  }
}
```

💡 **WHY**: Separating concerns (Controller vs Service) means you can:

- Test the service without HTTP
- Reuse the service from multiple controllers
- Swap the controller (REST → GraphQL) without touching logic

---

### 4. Dependency Injection (DI)

DI is how NestJS gives services what they need without you manually creating instances.

```typescript
// ❌ BAD (manual instantiation - hard to test, not scalable)
const prisma = new PrismaService();
const jwt = new JwtService();
const auth = new AuthService(prisma, jwt);

// ✅ GOOD (NestJS DI - automatic, testable, scalable)
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService, // NestJS injects this automatically
    private jwt: JwtService,
  ) {}
}
```

💡 **WHY**: DI makes your code:

- **Testable** - You can inject mock versions in tests
- **Decoupled** - Services don't create each other
- **Manageable** - NestJS handles singleton lifecycles

---

### 5. Guards

Guards are **middleware that runs before a route handler** to determine if a request should proceed.

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('No token provided');

    try {
      request.user = this.jwt.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

// Usage:
@Get('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SCHOOL_ADMIN')
getDashboard() { ... }
```

💡 **WHY**: Guards enforce security at the framework level. Without them, you'd have to manually check auth in every controller method — a recipe for forgotten checks and security holes.

---

### 6. Interceptors

Interceptors **wrap around** a request/response. Use them for:

- Logging
- Transforming response shape
- Caching
- Performance tracking

```typescript
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

💡 **WHY**: Every API response in EduSaas will follow the same shape `{ success, data, message }`. Without an interceptor, you'd have to manually shape every response.

---

### 7. Pipes

Pipes **transform or validate** incoming data before it reaches the controller.

```typescript
// Validation pipe - throws error if DTO validation fails
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true, // Auto-transform types (string → number)
  }),
);
```

💡 **WHY**: `whitelist: true` protects against **mass assignment attacks** where a hacker sends extra fields like `{ email: "...", role: "SUPER_ADMIN" }` hoping your code blindly saves it.

---

### 8. DTOs (Data Transfer Objects)

DTOs define the **shape of data** coming in (request body).

```typescript
// login.dto.ts
export class LoginDto {
  @IsEmail({}, { message: "Provide a valid email address" })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  password: string;
}
```

💡 **WHY**: DTOs + class-validator give you automatic validation with helpful error messages. No more `if (!req.body.email) return res.status(400)...` in every route.

---

### 9. Middleware

Middleware runs **before guards and interceptors**. Use for:

- Request logging
- Rate limiting
- IP whitelisting

```typescript
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  }
}
```

---

## 🟩 Prisma Concepts

Prisma is a **Type-Safe ORM** (Object Relational Mapper).

### The Problem Prisma Solves

```typescript
// ❌ Raw SQL - Easy to make typos, no autocomplete, SQL injection risk
const result = await db.query(`SELECT * FROM users WHERE emai = '${email}'`);
//                                                           ^^^^^ typo!

// ✅ Prisma - TypeScript-aware, autocomplete, safe
const user = await prisma.user.findUnique({ where: { email } });
//                 ^^^^  TypeScript knows this is a User model
```

### Schema

```prisma
// schema.prisma - Your entire database structure in one file
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      Role     @default(STUDENT)
  createdAt DateTime @default(now())

  // Relations
  school    School?  @relation(fields: [schoolId], references: [id])
  schoolId  String?
}

enum Role {
  SUPER_ADMIN
  SCHOOL_ADMIN
  TEACHER
  STUDENT
  PARENT
}
```

### Migrations

```bash
# Create migration after changing schema
npx prisma migrate dev --name add_device_sessions

# This creates:
# prisma/migrations/20240101_add_device_sessions/migration.sql
```

💡 **WHY**: Migrations are **version control for your database**. Every team member runs `prisma migrate dev` and their database matches yours exactly. No more "it works on my machine."

### Relations in Prisma

```prisma
// One-to-Many: One School has Many Students
model School {
  id       String    @id @default(cuid())
  name     String
  students Student[] // Array = one-to-many
}

model Student {
  id       String @id @default(cuid())
  school   School @relation(fields: [schoolId], references: [id])
  schoolId String // Foreign key stored here
}
```

---

## 🟥 Redis Concepts

Redis is an **in-memory key-value store**. Think of it as a super-fast temporary dictionary.

### Why Redis? Not Just PostgreSQL?

| Use Case                    | PostgreSQL             | Redis             |
| --------------------------- | ---------------------- | ----------------- |
| Read speed                  | ~10ms                  | ~0.1ms            |
| Store user sessions         | ❌ Slow                | ✅ Fast           |
| OTP codes (expire in 5 min) | ❌ Complex             | ✅ Built-in TTL   |
| Rate limiting               | ❌ Expensive           | ✅ Cheap          |
| Job queues                  | ❌ Not designed for it | ✅ BullMQ uses it |

### How We Use Redis

```typescript
// Store OTP with 5-minute expiry
await redis.set(`otp:${userId}`, otpCode, "EX", 300); // EX = expire in seconds

// Track active device session
await redis.set(`session:${userId}`, deviceId, "EX", 86400); // 24 hours

// Rate limiting - max 5 login attempts per 15 minutes
await redis.incr(`rate:login:${ip}`);
await redis.expire(`rate:login:${ip}`, 900);
```

---

## 🟨 Next.js Concepts (App Router)

### App Router vs Pages Router

```
❌ Old Way (Pages Router) - pages/
   pages/
   ├── index.tsx          → /
   ├── dashboard.tsx      → /dashboard
   └── api/
       └── auth.ts        → /api/auth

✅ New Way (App Router) - app/
   app/
   ├── page.tsx           → /
   ├── layout.tsx         → Wraps all pages
   ├── dashboard/
   │   ├── page.tsx       → /dashboard
   │   └── layout.tsx     → Dashboard-specific layout
   └── (auth)/            → Route group (no URL impact)
       ├── login/page.tsx → /login
       └── register/page.tsx → /register
```

### Server Components vs Client Components

```typescript
// ✅ Server Component (default) - runs on server, no useState/useEffect
// app/dashboard/page.tsx
async function DashboardPage() {
  // This runs on the SERVER - can access database directly!
  const stats = await fetch('http://api/stats'); // Server-side fetch

  return <div>Students: {stats.totalStudents}</div>;
}

// ✅ Client Component - runs in browser, can use state/effects
'use client'; // This directive makes it a Client Component

import { useState } from 'react';

function LoginForm() {
  const [email, setEmail] = useState('');
  return <input value={email} onChange={e => setEmail(e.target.value)} />;
}
```

💡 **WHY**: Server Components = faster initial load (no JS sent to browser), better SEO, can access backend directly. Use Client Components only when you need interactivity.

### Protected Routes Pattern

```typescript
// middleware.ts (Next.js middleware - runs on every request)
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token");

  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
```

---

## 🛠️ Project Setup — Step by Step

### Step 1: Initialize Monorepo

```bash
mkdir edusaas && cd edusaas

# Initialize pnpm workspace
cat > pnpm-workspace.yaml << EOF
packages:
  - 'apps/*'
  - 'packages/*'
EOF

# Initialize root package.json
cat > package.json << EOF
{
  "name": "edusaas",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "prettier": "^3.2.0",
    "eslint": "^8.57.0"
  }
}
EOF

# Install Turborepo
pnpm add -D turbo -w
```

### Step 2: Configure Turborepo

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### Step 3: Create Shared Packages

```bash
mkdir -p packages/types packages/config

# packages/types/package.json
cat > packages/types/package.json << EOF
{
  "name": "@edusaas/types",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
EOF

# packages/types/src/index.ts
cat > packages/types/src/index.ts << 'EOF'
export * from './user.types';
export * from './school.types';
export * from './api.types';
EOF
```

### Step 4: Create Shared Types

```typescript
// packages/types/src/user.types.ts
export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  SCHOOL_ADMIN = "SCHOOL_ADMIN",
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
  PARENT = "PARENT",
}

export interface UserPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  schoolId?: string;
}

// packages/types/src/api.types.ts
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}
```

### Step 5: Initialize NestJS App

```bash
mkdir -p apps/api
cd apps/api

# Install NestJS CLI if not already installed
pnpm add -g @nestjs/cli

# Create NestJS project
nest new . --package-manager pnpm --skip-git

# Install all required dependencies
pnpm add \
  @nestjs/common \
  @nestjs/core \
  @nestjs/platform-express \
  @nestjs/jwt \
  @nestjs/passport \
  @nestjs/swagger \
  @nestjs/config \
  @nestjs/throttler \
  @nestjs/schedule \
  @prisma/client \
  passport \
  passport-jwt \
  passport-local \
  bcryptjs \
  class-validator \
  class-transformer \
  zod \
  ioredis \
  bullmq \
  @bull-board/express \
  helmet \
  compression \
  cookie-parser \
  winston \
  nest-winston \
  uuid \
  dayjs \
  @edusaas/types

pnpm add -D \
  prisma \
  @types/bcryptjs \
  @types/passport-jwt \
  @types/passport-local \
  @types/cookie-parser \
  @types/compression \
  @types/uuid \
  jest \
  @types/jest \
  supertest \
  @types/supertest \
  ts-jest
```

### Step 6: NestJS Folder Structure

```bash
# Create the complete feature-based folder structure
cd apps/api/src

mkdir -p \
  modules/auth/{controllers,services,guards,strategies,dto,events} \
  modules/users/{controllers,services,repository,dto} \
  modules/schools/{controllers,services,repository,dto} \
  modules/students/{controllers,services,repository,dto} \
  modules/teachers/{controllers,services,repository,dto} \
  modules/exams/{controllers,services,repository,dto} \
  modules/results/{controllers,services,repository,dto} \
  modules/attendance/{controllers,services,repository,dto} \
  modules/billing/{controllers,services,repository,dto} \
  modules/notifications/{controllers,services,repository,dto} \
  modules/messaging/{controllers,services,repository,dto} \
  common/decorators \
  common/filters \
  common/guards \
  common/interceptors \
  common/pipes \
  common/middleware \
  config \
  database/prisma \
  queues \
  events \
  utils
```

**What each folder does:**

| Folder                      | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `modules/`                  | Each feature is a self-contained module     |
| `modules/auth/controllers/` | HTTP handlers for auth routes               |
| `modules/auth/services/`    | Auth business logic                         |
| `modules/auth/guards/`      | Route protection guards                     |
| `modules/auth/strategies/`  | Passport.js strategies (JWT, Local)         |
| `modules/auth/dto/`         | Login, Register data shapes                 |
| `modules/auth/events/`      | Domain events (UserLoggedIn, PasswordReset) |
| `modules/*/repository/`     | Database access layer (Prisma calls)        |
| `common/decorators/`        | Custom decorators (@CurrentUser, @Roles)    |
| `common/filters/`           | Global exception handlers                   |
| `common/guards/`            | Shared guards (JWT, Roles)                  |
| `common/interceptors/`      | Response transform, logging                 |
| `common/pipes/`             | Custom validation pipes                     |
| `config/`                   | Environment config (typed with Zod)         |
| `database/prisma/`          | Prisma service and client                   |
| `queues/`                   | BullMQ queue definitions                    |
| `events/`                   | Event emitter setup                         |

### Step 7: Initialize Next.js App

```bash
cd apps

# Create Next.js app
pnpm create next-app web \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git

cd web

# Install dependencies
pnpm add \
  axios \
  @tanstack/react-query \
  zustand \
  react-hook-form \
  @hookform/resolvers \
  zod \
  next-themes \
  sonner \
  lucide-react \
  @edusaas/types

# Install shadcn/ui
pnpm dlx shadcn-ui@latest init
```

**Next.js folder structure:**

```
apps/web/src/
├── app/
│   ├── layout.tsx              ← Root layout
│   ├── page.tsx                ← Landing page
│   ├── (auth)/                 ← Route group (no URL)
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/            ← Protected routes
│   │   ├── layout.tsx          ← Dashboard shell
│   │   ├── dashboard/page.tsx
│   │   ├── students/page.tsx
│   │   └── settings/page.tsx
│   └── api/                    ← Next.js API routes (if needed)
├── components/
│   ├── ui/                     ← shadcn/ui components
│   ├── shared/                 ← Reusable components
│   └── features/               ← Feature-specific components
│       ├── auth/
│       ├── students/
│       └── exams/
├── hooks/
│   ├── useAuth.ts
│   └── useStudents.ts
├── lib/
│   ├── axios.ts                ← Configured Axios instance
│   ├── queryClient.ts          ← React Query setup
│   └── utils.ts                ← Helper functions
├── services/
│   ├── auth.service.ts         ← API calls for auth
│   └── students.service.ts
├── store/
│   └── auth.store.ts           ← Zustand auth state
└── types/
    └── index.ts                ← Additional frontend types
```

### Step 8: Docker Compose for Local Development

```yaml
# docker-compose.yml (root)
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: edusaas_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: edusaas_user
      POSTGRES_PASSWORD: edusaas_password
      POSTGRES_DB: edusaas_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U edusaas_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: edusaas_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --requirepass edusaas_redis_password
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4
    container_name: edusaas_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@edusaas.ng
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  postgres_data:
  redis_data:
```

```bash
# Start all services
docker-compose up -d

# Check all running
docker-compose ps
```

### Step 9: Environment Configuration

```bash
# apps/api/.env
DATABASE_URL="postgresql://edusaas_user:edusaas_password@localhost:5432/edusaas_db"
REDIS_URL="redis://:edusaas_redis_password@localhost:6379"
JWT_SECRET="your-super-secret-jwt-key-at-least-32-chars"
JWT_EXPIRY="15m"
JWT_REFRESH_SECRET="your-refresh-secret-key"
JWT_REFRESH_EXPIRY="7d"
PORT=3001
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# SMS (Termii)
TERMII_API_KEY="your-termii-api-key"
TERMII_SENDER_ID="EduSaas"

# Identity Verification
PREMBLY_API_KEY="your-prembly-key"
PREMBLY_APP_ID="your-app-id"

# apps/web/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
NEXTAUTH_SECRET="next-auth-secret"
```

```typescript
// apps/api/src/config/env.config.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_EXPIRY: z.string().default("15m"),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  FRONTEND_URL: z.string().url(),
});

// This throws at startup if any env var is missing/invalid
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
```

💡 **WHY env validation?**: If `DATABASE_URL` is wrong, your app will fail trying to connect to the database — possibly 10 minutes into startup. With Zod validation, it fails **immediately at startup** with a clear error message. This saves hours of debugging.

---

## 📝 Day 1 Checklist

- [ ] Monorepo initialized with Turborepo + pnpm
- [ ] `packages/types` created with shared types
- [ ] `apps/api` — NestJS created with all dependencies
- [ ] `apps/web` — Next.js created with Tailwind + shadcn
- [ ] Docker Compose running (postgres + redis)
- [ ] Environment files created and validated
- [ ] Folder structures created

---

## 🔍 Key Concepts to Remember

1. **NestJS = Opinionated Express** — structure first, then code
2. **Guards → Interceptors → Pipes → Controller → Service** — that's the request lifecycle
3. **DTOs = Input Contracts** — define what data is allowed in
4. **Redis = Fast Temporary Storage** — sessions, OTPs, rate limits
5. **Monorepo = One Source of Truth** — shared types prevent frontend/backend drift
6. **Validate ENV at startup** — fail fast, not silently

---

_Next: Day 2 — Full Database Design with Prisma Schema_
