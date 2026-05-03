// apps/api/src/modules/auth/services/device-session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { NotificationGateway } from '../../notifications/gateways/notification.gateway';

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
          role: '',
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
    // 1. Remove from Redis immediately
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
    this.notificationGateway.notifyUserDeviceTerminated(userId, {
      reason,
      message:
        'Your session has been terminated. Another device has taken over.',
    });

    // 6. Write audit log
    await this.auditLog.log({
      action: 'SESSION_TERMINATED',
      entity: 'DeviceSession',
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
