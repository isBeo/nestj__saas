// apps/api/src/modules/auth/services/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { OtpService } from './otp.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { env } from '../../../config/env.config';
import { UserRole } from '@prisma/client';
import type { StringValue } from 'ms';

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
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
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
        id: true,
        email: true,
        password: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        isSuspended: true,
        firstName: true,
        lastName: true,
        managedSchoolId: true,
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
      throw new ForbiddenException(
        'Your account has been suspended. Contact support.',
      );
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
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
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
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
    const response = {
      data: null,
      message: 'If this email exists, you will receive a reset OTP',
    };

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
        expiresIn: env.JWT_EXPIRY as unknown as StringValue,
      }),
      this.jwt.signAsync(payload, {
        secret: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRY as unknown as StringValue,
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
