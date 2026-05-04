# 📅 Day 4 — One-Device Security, Redis Deep Dive & Identity Verification

### EduSaas Nigeria | Zero-Trust Session Architecture

---

## 🎯 Day 4 Goals

- [ ] Deeply understand Redis and how sessions work
- [ ] Build the complete One-Device-Per-User enforcement system
- [ ] Build the Security Recovery Flow (NIN/BVN verification)
- [ ] Build the Identity Verification abstraction layer
- [ ] Notify previous device when session is terminated
- [ ] Build device fingerprinting
- [ ] Set up WebSocket gateway for real-time device notifications
- [ ] Write audit logs for every security event
- [ ] Understand every pattern used

---

## 🧠 Concept: Why One-Device Login?

In Nigerian schools, account sharing is a real problem:

- Students share login credentials to take CBT exams for each other
- Teachers share accounts to falsify attendance
- Parents share accounts creating data integrity issues

One-device enforcement means: **one account = one active device at a time.**

If you try to log in from a second device, you must **prove your identity** before the old session is killed. This protects the school and the user.

---

## 🧠 Concept: Redis Architecture Deep Dive

Redis is not just a cache. Think of it as a **Swiss Army knife for real-time state**.

### How Redis Stores Data

```
Redis is a KEY → VALUE store.

Key:   "session:usr_abc123"
Value: '{"deviceId":"dev-xyz","role":"TEACHER","schoolId":"sch-001"}'
TTL:   86400 (expires in 24 hours automatically)
```

### Redis vs PostgreSQL for Sessions

```
Scenario: 1000 concurrent users hitting protected endpoints

PostgreSQL approach:
  - Each request: SELECT * FROM users WHERE id = ? AND isActive = true
  - 1000 DB queries per second → DB under pressure → slow responses

Redis approach:
  - Each request: GET session:userId (in-memory, microseconds)
  - 1000 Redis reads per second → no DB hit → blazing fast
  - DB query only when Redis misses (rare)
```

### Redis Data Structures We'll Use

```
STRING  → session:userId        (active session data)
STRING  → otp:userId:purpose    (OTP codes)
STRING  → rate:login:ip         (login attempt counter)
STRING  → device:termination:userId  (termination notification flag)
HASH    → user:profile:userId   (cached user profile fields)
LIST    → notifications:userId  (recent notifications queue)
```

### TTL (Time to Live) Strategy

```
Session token     → 24 hours  (86400s)
Refresh token     → 7 days    (604800s)
OTP code          → 5 minutes (300s)
Rate limit window → 15 minutes (900s)
Device notify     → 30 seconds (30s)  ← enough time to notify then cleanup
```

---

## 🏗️ Step 1 — Enhanced Redis Service

```typescript
// apps/api/src/common/redis/redis.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { env } from "../../config/env.config";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis; // public so RedisModule can expose it to BullMQ

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          this.logger.error("Redis: max retries reached");
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000); // Exponential backoff
      },
      reconnectOnError: (err) => {
        const targetErrors = ["READONLY", "ECONNRESET"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    this.client.on("connect", () => this.logger.log("✅ Redis connected"));
    this.client.on("ready", () => this.logger.log("✅ Redis ready"));
    this.client.on("error", (err) =>
      this.logger.error(`❌ Redis error: ${err.message}`),
    );
    this.client.on("close", () =>
      this.logger.warn("⚠️ Redis connection closed"),
    );
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ─── Core Operations ─────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ─── Atomic Counter (for rate limiting) ──────────────────

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  // ─── Hash Operations (for user profiles) ─────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  // ─── Pub/Sub (for device notifications) ──────────────────

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  // ─── Pattern-based key deletion ──────────────────────────

  async deleteByPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  // ─── Session Helpers (Domain-specific methods) ───────────

  sessionKey(userId: string) {
    return `session:${userId}`;
  }

  otpKey(userId: string, purpose: string) {
    return `otp:${userId}:${purpose}`;
  }

  rateLimitKey(action: string, identifier: string) {
    return `rate:${action}:${identifier}`;
  }

  deviceTerminationKey(userId: string) {
    return `device:terminated:${userId}`;
  }
}
```

---

## 🔒 Step 2 — Device Session Service

This is the **core of the one-device system**. It manages device sessions both in Redis (fast) and PostgreSQL (persistent).

```typescript
// apps/api/src/modules/auth/services/device-session.service.ts
import { Injectable, Logger, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma/prisma.service";
import { RedisService } from "../../../common/redis/redis.service";
import { AuditLogService } from "../../audit/audit-log.service";
import { NotificationGateway } from "../../notifications/gateways/notification.gateway";

export interface ActiveSession {
  deviceId: string;
  deviceName?: string;
  role: string;
  schoolId?: string;
  loginAt: string;
  ipAddress?: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class DeviceSessionService {
  private readonly logger = new Logger(DeviceSessionService.name);

  // Session TTL constants
  private readonly SESSION_TTL = 86400; // 24 hours
  private readonly TERMINATION_TTL = 30; // 30 seconds (for notify then clean)

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private auditLog: AuditLogService,
    private notificationGateway: NotificationGateway,
  ) {}

  // ─────────────────────────────────────────────────────
  // CHECK IF DEVICE CONFLICT EXISTS
  // ─────────────────────────────────────────────────────
  async checkDeviceConflict(
    userId: string,
    incomingDeviceId: string,
  ): Promise<{ hasConflict: boolean; existingSession?: ActiveSession }> {
    // 1. Fast path: check Redis
    const cached = await this.redis.get(this.redis.sessionKey(userId));

    if (cached) {
      const session: ActiveSession = JSON.parse(cached);

      if (session.deviceId !== incomingDeviceId) {
        return { hasConflict: true, existingSession: session };
      }

      return { hasConflict: false };
    }

    // 2. Fallback: check DB (Redis miss)
    const dbSession = await this.prisma.deviceSession.findUnique({
      where: { userId },
      select: {
        deviceId: true,
        deviceName: true,
        isActive: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    if (
      dbSession &&
      dbSession.isActive &&
      dbSession.deviceId !== incomingDeviceId
    ) {
      return {
        hasConflict: true,
        existingSession: {
          deviceId: dbSession.deviceId,
          deviceName: dbSession.deviceName ?? undefined,
          role: "",
          loginAt: dbSession.createdAt.toISOString(),
          ipAddress: dbSession.ipAddress ?? undefined,
        },
      };
    }

    return { hasConflict: false };
  }

  // ─────────────────────────────────────────────────────
  // CREATE / UPDATE SESSION (called after successful login)
  // ─────────────────────────────────────────────────────
  async createSession(
    userId: string,
    role: string,
    schoolId: string | undefined,
    refreshToken: string,
    device: DeviceInfo,
  ): Promise<void> {
    const sessionData: ActiveSession = {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      role,
      schoolId,
      loginAt: new Date().toISOString(),
      ipAddress: device.ipAddress,
    };

    // 1. Persist in Redis (fast session lookup)
    await this.redis.set(
      this.redis.sessionKey(userId),
      JSON.stringify(sessionData),
      this.SESSION_TTL,
    );

    // 2. Persist in PostgreSQL (durable record for audit/recovery)
    await this.prisma.deviceSession.upsert({
      where: { userId },
      create: {
        userId,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        refreshToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      update: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
        refreshToken,
        isActive: true,
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(
      `Session created: user=${userId} device=${device.deviceId} ip=${device.ipAddress}`,
    );
  }

  // ─────────────────────────────────────────────────────
  // TERMINATE EXISTING SESSION (Security Recovery)
  // ─────────────────────────────────────────────────────
  async terminateSession(
    userId: string,
    reason: string,
    terminatedBy: string, // userId of who triggered this
  ): Promise<void> {
    // 1. Get current session info (to notify the device)
    const currentSession = await this.redis.get(this.redis.sessionKey(userId));

    // 2. Remove from Redis immediately
    await this.redis.del(this.redis.sessionKey(userId));

    // 3. Mark session as inactive in DB
    await this.prisma.deviceSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    // 4. Set a short-lived termination flag in Redis
    //    The old device's WebSocket listener will pick this up
    await this.redis.set(
      this.redis.deviceTerminationKey(userId),
      JSON.stringify({ reason, terminatedAt: new Date().toISOString() }),
      this.TERMINATION_TTL,
    );

    // 5. Push real-time notification to old device via WebSocket
    await this.notificationGateway.notifyUserDeviceTerminated(userId, {
      reason,
      message:
        "Your session has been terminated. Another device has taken over.",
    });

    // 6. Write audit log
    await this.auditLog.log({
      action: "SESSION_TERMINATED",
      entity: "DeviceSession",
      entityId: userId,
      userId: terminatedBy,
      newValue: { reason },
    });

    this.logger.warn(
      `Session terminated: user=${userId} reason="${reason}" by=${terminatedBy}`,
    );
  }

  // ─────────────────────────────────────────────────────
  // VALIDATE ACTIVE SESSION (Used by JWT strategy)
  // ─────────────────────────────────────────────────────
  async validateSession(userId: string, deviceId: string): Promise<boolean> {
    const cached = await this.redis.get(this.redis.sessionKey(userId));

    if (!cached) return false;

    const session: ActiveSession = JSON.parse(cached);

    // If the device making the request doesn't match the active device
    if (session.deviceId !== deviceId) {
      this.logger.warn(
        `Session mismatch: user=${userId} expected=${session.deviceId} got=${deviceId}`,
      );
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────────────────
  // GET SESSION INFO
  // ─────────────────────────────────────────────────────
  async getSessionInfo(userId: string): Promise<ActiveSession | null> {
    const cached = await this.redis.get(this.redis.sessionKey(userId));
    if (!cached) return null;
    return JSON.parse(cached);
  }

  // ─────────────────────────────────────────────────────
  // REFRESH SESSION TTL (heartbeat — extends session)
  // ─────────────────────────────────────────────────────
  async refreshSessionTtl(userId: string): Promise<void> {
    const key = this.redis.sessionKey(userId);
    const exists = await this.redis.exists(key);
    if (exists) {
      await this.redis.expire(key, this.SESSION_TTL);
    }
  }
}
```

---

## 🆔 Step 3 — Identity Verification Abstraction Layer

This is a **senior engineering pattern**: never hardcode a vendor. If Prembly goes down, you swap providers without changing business logic.

```typescript
// apps/api/src/modules/auth/identity/identity-verification.interface.ts

export interface VerificationRequest {
  nin?: string; // National Identification Number
  bvn?: string; // Bank Verification Number
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // ISO date string
  phoneNumber?: string;
}

export interface VerificationResult {
  isVerified: boolean;
  confidence: number; // 0-100 score
  provider: string; // Which provider responded
  rawResponse?: any; // For debugging
  failureReason?: string;
}

// The contract every identity provider must implement
export interface IIdentityVerificationProvider {
  verifyNin(request: VerificationRequest): Promise<VerificationResult>;
  verifyBvn(request: VerificationRequest): Promise<VerificationResult>;
  getName(): string;
}
```

```typescript
// apps/api/src/modules/auth/identity/providers/prembly.provider.ts
import { Injectable, Logger } from "@nestjs/common";
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from "../identity-verification.interface";
import { env } from "../../../../config/env.config";

@Injectable()
export class PremblyProvider implements IIdentityVerificationProvider {
  private readonly logger = new Logger(PremblyProvider.name);
  private readonly BASE_URL =
    "https://api.prembly.com/identitypass/verification";

  getName(): string {
    return "prembly";
  }

  async verifyNin(request: VerificationRequest): Promise<VerificationResult> {
    try {
      const response = await fetch(`${this.BASE_URL}/nin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.PREMBLY_API_KEY ?? "",
          "app-id": env.PREMBLY_APP_ID ?? "",
        },
        body: JSON.stringify({
          number: request.nin,
          firstname: request.firstName,
          lastname: request.lastName,
        }),
      });

      const data = await response.json();

      // Prembly returns status and verification object
      if (data.status === true && data.nin_data) {
        const nameMatch = this.checkNameMatch(
          request.firstName,
          request.lastName,
          data.nin_data.firstname,
          data.nin_data.lastname,
        );

        return {
          isVerified: nameMatch.score > 70,
          confidence: nameMatch.score,
          provider: this.getName(),
          rawResponse: data,
        };
      }

      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason: data.detail || "NIN verification failed",
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error("Prembly NIN verification error", error);
      throw error;
    }
  }

  async verifyBvn(request: VerificationRequest): Promise<VerificationResult> {
    try {
      const response = await fetch(`${this.BASE_URL}/bvn/basic`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.PREMBLY_API_KEY ?? "",
          "app-id": env.PREMBLY_APP_ID ?? "",
        },
        body: JSON.stringify({
          number: request.bvn,
          firstname: request.firstName,
          lastname: request.lastName,
        }),
      });

      const data = await response.json();

      if (data.status === true && data.bvn_data) {
        const nameMatch = this.checkNameMatch(
          request.firstName,
          request.lastName,
          data.bvn_data.firstName,
          data.bvn_data.lastName,
        );

        return {
          isVerified: nameMatch.score > 70,
          confidence: nameMatch.score,
          provider: this.getName(),
          rawResponse: data,
        };
      }

      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason: "BVN verification failed",
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error("Prembly BVN verification error", error);
      throw error;
    }
  }

  // Fuzzy name matching — handles Chidi vs CHIDI, etc.
  private checkNameMatch(
    inFirst: string,
    inLast: string,
    dbFirst: string,
    dbLast: string,
  ): { score: number } {
    const normalize = (s: string) => s.toLowerCase().trim();

    const firstMatch = normalize(inFirst) === normalize(dbFirst) ? 50 : 0;
    const lastMatch = normalize(inLast) === normalize(dbLast) ? 50 : 0;

    return { score: firstMatch + lastMatch };
  }
}
```

```typescript
// apps/api/src/modules/auth/identity/providers/dojah.provider.ts
// A second provider — demonstrates the abstraction power

import { Injectable, Logger } from "@nestjs/common";
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from "../identity-verification.interface";

@Injectable()
export class DojahProvider implements IIdentityVerificationProvider {
  private readonly logger = new Logger(DojahProvider.name);

  getName(): string {
    return "dojah";
  }

  async verifyNin(request: VerificationRequest): Promise<VerificationResult> {
    // Dojah API implementation
    // Different API, same return shape → business logic never changes
    this.logger.log("Verifying NIN via Dojah");
    // TODO: implement Dojah API call
    return { isVerified: false, confidence: 0, provider: this.getName() };
  }

  async verifyBvn(request: VerificationRequest): Promise<VerificationResult> {
    this.logger.log("Verifying BVN via Dojah");
    // TODO: implement Dojah API call
    return { isVerified: false, confidence: 0, provider: this.getName() };
  }
}
```

```typescript
// apps/api/src/modules/auth/identity/identity-verification.service.ts
// The orchestrator — picks provider, handles fallback
import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from "./identity-verification.interface";
import { PremblyProvider } from "./providers/prembly.provider";
import { DojahProvider } from "./providers/dojah.provider";

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  // Ordered list of providers — primary first, fallbacks after
  private providers: IIdentityVerificationProvider[];

  constructor(
    private prembly: PremblyProvider,
    private dojah: DojahProvider,
  ) {
    this.providers = [prembly, dojah]; // Prembly is primary
  }

  async verifyIdentity(
    request: VerificationRequest,
  ): Promise<VerificationResult> {
    if (!request.nin && !request.bvn) {
      throw new BadRequestException(
        "Either NIN or BVN is required for verification",
      );
    }

    // Try each provider in order — if one fails, try the next
    for (const provider of this.providers) {
      try {
        this.logger.log(
          `Attempting identity verification via ${provider.getName()}`,
        );

        let result: VerificationResult;

        if (request.nin) {
          result = await provider.verifyNin(request);
        } else {
          result = await provider.verifyBvn(request!);
        }

        if (result.isVerified || result.confidence > 0) {
          // Got a meaningful response from this provider
          this.logger.log(
            `Verification via ${provider.getName()}: ${result.isVerified} (${result.confidence}%)`,
          );
          return result;
        }
      } catch (error) {
        this.logger.warn(
          `Provider ${provider.getName()} failed: ${error.message}. Trying next...`,
        );
        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    throw new ServiceUnavailableException(
      "Identity verification service is temporarily unavailable. Please try again later.",
    );
  }
}
```

---

## 🔄 Step 4 — Security Recovery Flow Service

```typescript
// apps/api/src/modules/auth/services/security-recovery.service.ts
import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma/prisma.service";
import { RedisService } from "../../../common/redis/redis.service";
import { IdentityVerificationService } from "../identity/identity-verification.service";
import { DeviceSessionService } from "./device-session.service";
import { AuditLogService } from "../../audit/audit-log.service";
import * as crypto from "crypto";

export interface SecurityRecoveryDto {
  email: string;
  deviceId: string; // The new device trying to take over
  deviceName?: string;
  nin?: string;
  bvn?: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class SecurityRecoveryService {
  private readonly logger = new Logger(SecurityRecoveryService.name);

  // Max recovery attempts per hour
  private readonly MAX_ATTEMPTS = 3;
  private readonly ATTEMPT_WINDOW = 3600; // 1 hour in seconds

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private identityVerification: IdentityVerificationService,
    private deviceSession: DeviceSessionService,
    private auditLog: AuditLogService,
  ) {}

  async initiateRecovery(
    dto: SecurityRecoveryDto,
    ipAddress: string,
    userAgent: string,
  ) {
    // 1. Rate limit recovery attempts (prevent abuse)
    const rateLimitKey = this.redis.rateLimitKey("recovery", ipAddress);
    const attempts = await this.redis.incr(rateLimitKey);

    if (attempts === 1) {
      // First attempt — set TTL
      await this.redis.expire(rateLimitKey, this.ATTEMPT_WINDOW);
    }

    if (attempts > this.MAX_ATTEMPTS) {
      const ttl = await this.redis.ttl(rateLimitKey);
      const minutesLeft = Math.ceil(ttl / 60);

      throw new ForbiddenException(
        `Too many recovery attempts. Try again in ${minutesLeft} minutes.`,
      );
    }

    // 2. Find the user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        managedSchoolId: true,
        nin: true,
        bvn: true,
      },
    });

    if (!user) {
      // ⚠️ SECURITY: Same response whether user exists or not
      throw new UnauthorizedException("Identity verification failed");
    }

    // 3. Verify identity via NIN or BVN
    const verificationResult = await this.identityVerification.verifyIdentity({
      nin: dto.nin,
      bvn: dto.bvn,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    if (!verificationResult.isVerified) {
      await this.auditLog.log({
        action: "RECOVERY_IDENTITY_FAILED",
        entity: "User",
        entityId: user.id,
        newValue: {
          provider: verificationResult.provider,
          confidence: verificationResult.confidence,
          ipAddress,
        },
      });

      throw new UnauthorizedException(
        "Identity verification failed. Provided details do not match our records.",
      );
    }

    // 4. ✅ Identity verified — terminate old session
    await this.deviceSession.terminateSession(
      user.id,
      "Security recovery: identity verified on new device",
      user.id, // self-initiated
    );

    // 5. Log successful recovery
    await this.auditLog.log({
      action: "SECURITY_RECOVERY_SUCCESS",
      entity: "User",
      entityId: user.id,
      newValue: {
        provider: verificationResult.provider,
        newDeviceId: dto.deviceId,
        ipAddress,
      },
    });

    // 6. Clear rate limit on success
    await this.redis.del(rateLimitKey);

    this.logger.warn(
      `Security recovery completed: user=${user.id} new_device=${dto.deviceId}`,
    );

    return {
      data: {
        userId: user.id,
        recoveryToken: this.generateRecoveryToken(), // One-time token to complete login
      },
      message: "Identity verified. Old session terminated. You may now login.",
    };
  }

  // One-time token that grants permission to login after recovery
  // without going through full identity verification again
  private generateRecoveryToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}
```

---

## 📡 Step 5 — WebSocket Gateway (Real-time Device Notifications)

```typescript
// apps/api/src/modules/notifications/gateways/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env } from "../../../config/env.config";

interface ConnectedClient {
  userId: string;
  deviceId: string;
  socketId: string;
}

@WebSocketGateway({
  cors: {
    origin: [env.FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
  },
  namespace: "/notifications", // ws://localhost:3001/notifications
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // Map of userId → Set of socket IDs (user may have one socket per browser tab)
  private connectedClients = new Map<string, ConnectedClient>();

  constructor(private jwt: JwtService) {}

  // ─────────────────────────────────────────────────────
  // CONNECTION HANDLING
  // ─────────────────────────────────────────────────────
  async handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        this.logger.warn(`WS: Unauthenticated connection attempt ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token, { secret: env.JWT_SECRET });
      const deviceId = client.handshake.auth?.deviceId || "unknown";

      // Store client info
      this.connectedClients.set(client.id, {
        userId: payload.sub,
        deviceId,
        socketId: client.id,
      });

      // Join room named after userId (for targeted messaging)
      client.join(`user:${payload.sub}`);

      this.logger.log(
        `WS connected: user=${payload.sub} socket=${client.id} device=${deviceId}`,
      );
    } catch (err) {
      this.logger.warn(`WS: Invalid token, disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      this.logger.log(
        `WS disconnected: user=${clientInfo.userId} socket=${client.id}`,
      );
      this.connectedClients.delete(client.id);
    }
  }

  // ─────────────────────────────────────────────────────
  // EMIT DEVICE TERMINATED EVENT
  // ─────────────────────────────────────────────────────
  async notifyUserDeviceTerminated(
    userId: string,
    payload: { reason: string; message: string },
  ): Promise<void> {
    // Emit to all sockets in the user's room
    this.server.to(`user:${userId}`).emit("device:terminated", {
      ...payload,
      timestamp: new Date().toISOString(),
    });

    this.logger.warn(`WS: Device termination sent to user=${userId}`);
  }

  // ─────────────────────────────────────────────────────
  // EMIT GENERAL NOTIFICATION
  // ─────────────────────────────────────────────────────
  async sendNotification(
    userId: string,
    notification: { title: string; body: string; type: string; data?: any },
  ): Promise<void> {
    this.server.to(`user:${userId}`).emit("notification:new", {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────
  // CLIENT EVENTS (messages FROM browser)
  // ─────────────────────────────────────────────────────
  @SubscribeMessage("ping")
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit("pong", { timestamp: new Date().toISOString() });
  }

  // Get list of online users (for admins)
  getOnlineUsers(): string[] {
    return Array.from(this.connectedClients.values()).map((c) => c.userId);
  }
}
```

---

## 📋 Step 6 — Audit Log Service

```typescript
// apps/api/src/modules/audit/audit-log.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";

interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    // Fire and forget — don't await, don't block the main flow
    this.prisma.auditLog
      .create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          userId: entry.userId,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      })
      .catch((err) => {
        // Log to console but don't crash the app
        console.error("AuditLog write failed:", err.message);
      });
  }
}
```

---

## 🔁 Step 7 — Updated Login Flow (Integrating Everything)

Now we update `AuthService.login()` to use our new services:

```typescript
// apps/api/src/modules/auth/services/auth.service.ts  (updated login method)

async login(dto: LoginDto, ipAddress: string, userAgent: string) {
  // ... (steps 1-3 from Day 3 remain the same: find user, check password, check account status)

  // ─── Step 4: ONE DEVICE CHECK ──────────────────────────
  const { hasConflict, existingSession } =
    await this.deviceSessionService.checkDeviceConflict(user.id, dto.deviceId);

  if (hasConflict) {
    // Log the conflict attempt
    await this.auditLog.log({
      action: 'LOGIN_DEVICE_CONFLICT',
      entity: 'User',
      entityId: user.id,
      newValue: {
        attemptingDeviceId: dto.deviceId,
        existingDeviceId: existingSession?.deviceId,
        ipAddress,
      },
    });

    // Throw structured error so frontend can trigger recovery flow
    throw new ForbiddenException({
      message: 'This account is already active on another device.',
      code: 'DEVICE_CONFLICT',
      existingDevice: existingSession?.deviceName || 'Unknown device',
      loginAt: existingSession?.loginAt,
    });
  }

  // ─── Step 5: Generate tokens ────────────────────────────
  const tokens = await this.generateTokens(user.id, user.email, user.role);

  // ─── Step 6: Create/update session ─────────────────────
  await this.deviceSessionService.createSession(
    user.id,
    user.role,
    user.managedSchoolId ?? undefined,
    tokens.refreshToken,
    {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      deviceType: this.detectDeviceType(userAgent),
      ipAddress,
      userAgent,
    },
  );

  // ─── Step 7: Audit log ──────────────────────────────────
  await this.auditLog.log({
    action: 'LOGIN_SUCCESS',
    entity: 'User',
    entityId: user.id,
    newValue: { deviceId: dto.deviceId, ipAddress },
    ipAddress,
    userAgent,
  });

  // ─── Step 8: Update last login ──────────────────────────
  await this.prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
  });

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
```

---

## 🔐 Step 8 — Security Recovery Controller

```typescript
// apps/api/src/modules/auth/controllers/security-recovery.controller.ts
import {
  Controller,
  Post,
  Body,
  Ip,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Request } from "express";
import { IsString, IsEmail, IsOptional, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { SecurityRecoveryService } from "../services/security-recovery.service";
import { Public } from "../../../common/decorators/public.decorator";

class SecurityRecoveryDto {
  @ApiProperty({ example: "chidi@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "new-device-uuid" })
  @IsString()
  deviceId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({ example: "12345678901", required: false })
  @IsOptional()
  @IsString()
  nin?: string;

  @ApiProperty({ example: "12345678901", required: false })
  @IsOptional()
  @IsString()
  bvn?: string;

  @ApiProperty({ example: "Chidi" })
  @IsString()
  firstName: string;

  @ApiProperty({ example: "Okonkwo" })
  @IsString()
  lastName: string;
}

@ApiTags("Auth")
@Controller({ path: "auth/security-recovery", version: "1" })
export class SecurityRecoveryController {
  constructor(private recoveryService: SecurityRecoveryService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Recover account from device conflict using NIN/BVN",
    description: `
      When a user tries to login from a new device but the account is active
      on another device, they must verify their identity using NIN or BVN.
      
      On success: old session is terminated, new device is allowed to login.
    `,
  })
  @ApiResponse({
    status: 200,
    description: "Identity verified, old session terminated",
  })
  @ApiResponse({ status: 401, description: "Identity verification failed" })
  @ApiResponse({ status: 403, description: "Too many attempts" })
  async initiateRecovery(
    @Body() dto: SecurityRecoveryDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers["user-agent"] || "unknown";
    return this.recoveryService.initiateRecovery(dto, ip, userAgent);
  }
}
```

---

## 🔁 Step 9 — Rate Limiting (Enhanced per-endpoint)

```typescript
// apps/api/src/common/guards/throttle.decorator.ts

import { Throttle, SkipThrottle } from "@nestjs/throttler";

// Use these decorators per route to override global limits:

// @Throttle({ default: { ttl: 900000, limit: 5 } })  ← 5 attempts per 15 min
// Perfect for login endpoint

// @SkipThrottle()  ← No rate limit (for health checks etc.)

// Example usage in controller:
/*
  @Post('login')
  @Public()
  @Throttle({ default: { ttl: 900000, limit: 5 } })  // 5 attempts per 15 min
  async login(@Body() dto: LoginDto) { ... }

  @Post('security-recovery')
  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 3 } })  // 3 attempts per hour
  async recover(@Body() dto: RecoveryDto) { ... }
*/
```

---

## 🧬 Step 10 — Device Fingerprint Helper (Frontend Side)

This runs in the browser and generates a stable device ID:

```typescript
// apps/web/src/lib/device.ts
import { v4 as uuidv4 } from "uuid";

const DEVICE_ID_KEY = "edusaas_device_id";
const DEVICE_NAME_KEY = "edusaas_device_name";

export function getDeviceId(): string {
  // Use localStorage so the ID persists across sessions on same browser
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = uuidv4(); // Generate once, store forever
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

export function getDeviceName(): string {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);

  if (!deviceName) {
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const isTablet = /iPad|Tablet/.test(ua);
    const browser = getBrowser(ua);
    const os = getOS(ua);

    deviceName = `${browser} on ${os} (${isMobile ? "Mobile" : isTablet ? "Tablet" : "Desktop"})`;
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }

  return deviceName;
}

function getBrowser(ua: string): string {
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return "Browser";
}

function getOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown OS";
}
```

---

## 📊 Complete Security Flow Diagram

```
User tries to login from Device B
            │
            ▼
    [Check Device Conflict]
            │
    ┌───────┴────────┐
    │                │
  No conflict    Conflict detected
    │                │
    ▼                ▼
  Login          Return 403 DEVICE_CONFLICT
  Success        + existingDevice info
                     │
                     ▼
               [Frontend shows Recovery UI]
                     │
                     ▼
            User provides NIN or BVN
                     │
                     ▼
          [POST /auth/security-recovery]
                     │
                     ▼
           [Rate limit check]
                     │
                ┌────┴────┐
                │         │
             OK         Too many
                │       attempts
                ▼         │
         [Identity       Throw 403
          Verification]
                │
          ┌─────┴─────┐
          │           │
       Verified    Not Verified
          │           │
          ▼           ▼
  [Terminate       Throw 401
   old session]   + audit log
          │
          ▼
  [Notify old device via WebSocket]
          │
          ▼
  [Return recovery token]
          │
          ▼
  [User completes login normally]
          │
          ▼
  [New session created for Device B]
```

---

## 📝 Day 4 Checklist

- [ ] Enhanced `RedisService` with all required operations
- [ ] `DeviceSessionService` managing Redis + DB sessions
- [ ] `IdentityVerificationService` with provider abstraction
- [ ] `PremblyProvider` and `DojahProvider` implemented
- [ ] `SecurityRecoveryService` with rate limiting + audit
- [ ] `NotificationGateway` WebSocket set up
- [ ] `AuditLogService` writing all security events
- [ ] Login flow fully integrated with device session service
- [ ] `SecurityRecoveryController` wired up
- [ ] Device fingerprint helper on frontend
- [ ] Swagger docs complete for all endpoints

---

## 🔑 Senior Engineering Patterns Used Today

| Pattern                    | Name                          | Why It Matters                               |
| -------------------------- | ----------------------------- | -------------------------------------------- |
| Provider abstraction       | **Strategy Pattern**          | Swap identity vendors without changing logic |
| Redis + DB dual write      | **Cache-Aside Pattern**       | Speed + durability combined                  |
| Fire-and-forget audit      | **Async Side Effects**        | Audit never blocks the main request          |
| WebSocket rooms            | **Room-Based Pub/Sub**        | Target notifications to specific users       |
| Rate limit on Redis `incr` | **Token Bucket (simplified)** | Atomic counter, no race conditions           |
| Structured error codes     | **Error Contract**            | Frontend knows what to do with each error    |
| Fuzzy name matching        | **Data Normalization**        | Handles "CHIDI" vs "Chidi" gracefully        |

---

_Next: Day 5 — Core Modules: Schools, Students, Teachers, Classrooms & Results_
