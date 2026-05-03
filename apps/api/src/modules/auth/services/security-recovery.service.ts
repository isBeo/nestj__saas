// apps/api/src/modules/auth/services/security-recovery.service.ts
import {
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { IdentityVerificationService } from '../identity/identity-verification.service';
import { DeviceSessionService } from './device-session.service';
import { AuditLogService } from '../../audit/audit-log.service';
import * as crypto from 'crypto';

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
    _userAgent: string,
  ) {
    void _userAgent;
    // 1. Rate limit recovery attempts (prevent abuse)
    const rateLimitKey = this.redis.rateLimitKey('recovery', ipAddress);
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
      throw new UnauthorizedException('Identity verification failed');
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
        action: 'RECOVERY_IDENTITY_FAILED',
        entity: 'User',
        entityId: user.id,
        newValue: {
          provider: verificationResult.provider,
          confidence: verificationResult.confidence,
          ipAddress,
        },
      });

      throw new UnauthorizedException(
        'Identity verification failed. Provided details do not match our records.',
      );
    }

    // 4. ✅ Identity verified — terminate old session
    await this.deviceSession.terminateSession(
      user.id,
      'Security recovery: identity verified on new device',
      user.id, // self-initiated
    );

    // 5. Log successful recovery
    await this.auditLog.log({
      action: 'SECURITY_RECOVERY_SUCCESS',
      entity: 'User',
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
      message: 'Identity verified. Old session terminated. You may now login.',
    };
  }

  // One-time token that grants permission to login after recovery
  // without going through full identity verification again
  private generateRecoveryToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
