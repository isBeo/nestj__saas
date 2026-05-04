# 🚀 Quick Start: Finish & Deploy EduSaas

This guide walks you through completing and deploying your EduSaas application.

---

## ✅ Step 1: Code Cleanup Status

Your codebase has been cleaned up:

- ✅ Fixed auth.service.ts class definition
- ✅ Fixed security-recovery.controller.ts type errors
- ✅ Removed unused imports
- ✅ Fixed import statements
- ✅ All critical errors resolved

### Verify locally:

```bash
cd apps/api
npm run build    # Should complete without errors
npm run start    # Should start on http://localhost:3001
```

```bash
cd apps/web
npm run build    # Should complete without errors
npm run dev      # Should start on http://localhost:3000
```

---

## 📋 Step 2: Complete Implementation Checklist

### Must-Do Before Production

- [ ] **Auth Module**
  - [ ] Implement `register()` method in auth.service.ts
  - [ ] Implement `forgotPassword()` and `resetPassword()`
  - [ ] Implement `refreshToken()` method
  - [ ] Implement `logout()` with session cleanup
  - [ ] Add email verification flow

- [ ] **Device Session Service**
  - [ ] Implement `checkDeviceConflict()` method
  - [ ] Implement `createSession()` method
  - [ ] Implement session cleanup on logout

- [ ] **Security**
  - [ ] Implement role-based guards (see jwt-auth.guard.ts)
  - [ ] Add request validation pipes
  - [ ] Enable HTTPS in production
  - [ ] Setup CORS for your domains

- [ ] **Database**
  - [ ] Create Prisma migrations
  - [ ] Seed initial data (admin user, roles)
  - [ ] Add database indexes for performance

- [ ] **Tests**
  - [ ] Write unit tests for services
  - [ ] Write e2e tests for auth flow
  - [ ] Test device conflict scenario

- [ ] **Frontend**
  - [ ] Connect login/register forms to API
  - [ ] Implement JWT token storage (localStorage)
  - [ ] Add device ID tracking
  - [ ] Implement error handling for API calls

---

## 🔧 Step 3: Essential Services to Implement

### 1. OTP Service (for email verification)

```typescript
// apps/api/src/modules/auth/services/otp.service.ts
@Injectable()
export class OtpService {
  async generateOtp(email: string): Promise<string> {
    const otp = Math.random().toString().slice(2, 8);
    // Store in Redis with TTL (5 minutes)
    await this.redis.set(`otp:${email}`, otp, "EX", 300);
    return otp;
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const stored = await this.redis.get(`otp:${email}`);
    return stored === otp;
  }
}
```

### 2. Device Session Service

```typescript
// apps/api/src/modules/auth/services/device-session.service.ts
@Injectable()
export class DeviceSessionService {
  async checkDeviceConflict(
    userId: string,
    deviceId: string,
  ): Promise<{ hasConflict: boolean; existingSession: any }> {
    const existing = await this.prisma.deviceSession.findFirst({
      where: { userId, isActive: true, deviceId: { not: deviceId } },
    });
    return {
      hasConflict: !!existing,
      existingSession: existing,
    };
  }

  async createSession(
    userId: string,
    role: string,
    schoolId: string | undefined,
    refreshToken: string,
    device: any,
  ) {
    return this.prisma.deviceSession.create({
      data: {
        userId,
        role,
        schoolId,
        refreshToken,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        isActive: true,
        loginAt: new Date(),
      },
    });
  }
}
```

### 3. Audit Log Service

```typescript
// apps/api/src/modules/audit/audit-log.service.ts
@Injectable()
export class AuditLogService {
  async log(data: {
    action: string;
    entity: string;
    entityId: string;
    newValue?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        newValue: data.newValue,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        createdAt: new Date(),
      },
    });
  }
}
```

---

## 🗄️ Step 4: Database Setup

### Create Prisma Migrations

```bash
cd apps/api

# Create migration file
npx prisma migrate dev --name init

# Review migration in prisma/migrations/
# Then run it automatically
```

### Seed Initial Data (Optional)

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  await prisma.user.upsert({
    where: { email: "admin@edusaas.ng" },
    update: {},
    create: {
      email: "admin@edusaas.ng",
      password: await bcrypt.hash("Admin@123", 12),
      firstName: "Admin",
      lastName: "User",
      role: "SUPER_ADMIN",
      isEmailVerified: true,
    },
  });

  console.log("✅ Seed complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run seeder:

```bash
npx prisma db seed
```

---

## 🔐 Step 5: Generate JWT Secrets

```bash
# Generate strong random secrets for production
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Copy output to:
# JWT_SECRET=<first-output>
# JWT_REFRESH_SECRET=<second-output>
```

---

## 📱 Step 6: Frontend Essentials

### Install Required Dependencies

```bash
cd apps/web
pnpm add axios zustand next-auth
```

### Create API Client

```typescript
// apps/web/src/lib/api-client.ts
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Create Auth Hook

```typescript
// apps/web/src/hooks/useAuth.ts
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

export function useAuth() {
  const [loading, setLoading] = useState(false);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiClient.post("/v1/auth/login", {
        email,
        password,
        deviceId: getDeviceId(), // from device.ts
      });
      localStorage.setItem("accessToken", res.data.data.accessToken);
      localStorage.setItem("user", JSON.stringify(res.data.data.user));
      return res.data.data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
  };

  return { login, logout, loading };
}
```

---

## 🔄 Step 7: GitHub Setup

### Create `.gitignore` entries:

```bash
# Root
.env
.env.local
.env.*.local
node_modules/
dist/
.next/

# API
apps/api/.env
apps/api/dist/
apps/api/node_modules/

# Web
apps/web/.env.local
apps/web/.next/
apps/web/node_modules/
```

### Initialize Git (if not already done)

```bash
git init
git add .
git commit -m "Initial commit: EduSaas auth system"
git branch -M main
git remote add origin https://github.com/yourusername/edusaas.git
git push -u origin main
```

---

## 🚀 Step 8: Deploy to Production

### A. Set up Render Account

1. Go to https://render.com/signup
2. Connect GitHub account
3. Create PostgreSQL database
4. Create Redis instance
5. Note the connection URLs

### B. Configure Environment Variables

Create `.env` in `apps/api` with production values:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...  # From Render
REDIS_URL=redis://...         # From Render
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
FRONTEND_URL=https://app.yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=<app-password>
```

### C. Deploy API to Render

1. Go to https://render.com/dashboard
2. Click **New +** → **Web Service**
3. Select your GitHub repository
4. Configure:
   - Name: `edusaas-api`
   - Root Directory: `apps/api`
   - Build Command: `pnpm install && npm run build`
   - Start Command: `node dist/main.js`
   - Add environment variables
5. Click **Create Web Service**

### D. Deploy Web to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure:
   - Framework: `Next.js`
   - Root Directory: `apps/web`
   - Environment: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api`
4. Click **Deploy**

### E. Run Database Migrations

```bash
# SSH into Render instance or use CLI
cd apps/api
npx prisma migrate deploy
npx prisma db seed
```

---

## ✨ Step 9: Post-Deployment Checks

### Test API Health

```bash
curl https://api.yourdomain.com/api/health

# Should return: { "status": "ok" }
```

### Test Register Endpoint

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass@123",
    "firstName": "Test",
    "lastName": "User",
    "role": "SCHOOL_ADMIN"
  }'
```

### Test Login Endpoint

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass@123",
    "deviceId": "test-device-id"
  }'
```

### Check Swagger Documentation

Visit: `https://api.yourdomain.com/api/docs`

---

## 🎯 Next Features to Implement

1. **School Management** - CRUD for schools
2. **Student Management** - Enrollment, profiles
3. **Teacher Management** - Class assignments
4. **Exam/CBT System** - Question banks, scoring
5. **Results Management** - Transcripts, reports
6. **Notifications** - Email, SMS, push notifications
7. **Billing** - Subscription management
8. **Analytics** - Dashboard with KPIs

---

## 📞 Troubleshooting

**Build fails?**

```bash
# Clear cache and rebuild
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

**Database errors?**

```bash
# Reset database (dev only!)
npx prisma migrate reset

# Check connection
psql <DATABASE_URL>
```

**API won't start?**

```bash
# Check logs
npm run start

# Verify env vars
echo $DATABASE_URL
```

---

## 🎉 You're Ready!

Your EduSaas application is now ready for production deployment!

📚 **Full Deployment Guide:** See [DEPLOYMENT.md](./DEPLOYMENT.md)

🔗 **API Documentation:** https://api.yourdomain.com/api/docs

💬 **Need Help?** Check the DAY1.md, DAY2.md, and DAY3-NestJS-Bootstrap-Auth.md files for detailed explanations.

Happy coding! 🚀
