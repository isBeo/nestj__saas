// apps/api/src/modules/auth/services/auth.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { OtpService } from './otp.service';
import { DeviceSessionService } from './device-session.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { env } from '../../../config/env.config';
import * as bcrypt from 'bcryptjs';
import type { UserRole } from '@prisma/client';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
    private otp: OtpService,
    private deviceSessionService: DeviceSessionService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        password: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        managedSchoolId: dto.role === 'SCHOOL_ADMIN' ? dto.schoolId : undefined,
      },
      select: { id: true, email: true },
    });

    await this.otp.sendOtp(user.id, dto.email, 'EMAIL_VERIFY');

    return { message: 'Registration successful. OTP sent to email.' };
  }

  async login(dto: LoginDto, ipAddress: string, userAgent: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        isSuspended: true,
        managedSchoolId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.isSuspended) {
      throw new ForbiddenException('Account is suspended');
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const { hasConflict, existingSession } =
      await this.deviceSessionService.checkDeviceConflict(
        user.id,
        dto.deviceId,
      );

    if (hasConflict) {
      throw new ForbiddenException({
        message: 'This account is already active on another device.',
        code: 'DEVICE_CONFLICT',
        existingDevice: existingSession?.deviceName || 'Unknown device',
        loginAt: existingSession?.loginAt,
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string) {
    await this.redis.del(this.redis.sessionKey(userId));
    await this.prisma.deviceSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return { message: 'Logged out' };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new BadRequestException('Refresh token required');

    let payload: { sub: string; email: string; role: UserRole };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.deviceSession.findUnique({
      where: { refreshToken },
      select: { userId: true, isActive: true, expiresAt: true },
    });

    if (
      !session ||
      !session.isActive ||
      session.userId !== payload.sub ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokens = await this.generateTokens(
      payload.sub,
      payload.email,
      payload.role,
    );

    await this.prisma.deviceSession.update({
      where: { refreshToken },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: this.refreshExpiryDate(),
        lastSeenAt: new Date(),
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async verifyEmail(email: string, otp: string) {
    await this.otp.verifyOtp(email, otp, 'EMAIL_VERIFY');
    await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });
    return { message: 'Email verified' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (user) {
      await this.otp.sendOtp(user.id, user.email, 'PASSWORD_RESET');
    }

    return { message: 'If the email exists, an OTP has been sent.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    await this.otp.verifyOtp(email, otp, 'PASSWORD_RESET');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const user = await this.prisma.user.update({
      where: { email },
      data: { password: passwordHash },
      select: { id: true },
    });

    await this.logout(user.id);
    return { message: 'Password reset successful' };
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const basePayload = { sub: userId, email, role };

    const accessToken = await this.jwt.signAsync(basePayload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRY as unknown as StringValue,
    });

    const refreshToken = await this.jwt.signAsync(basePayload, {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.JWT_REFRESH_EXPIRY as unknown as StringValue,
    });

    return { accessToken, refreshToken };
  }

  private refreshExpiryDate(): Date {
    const expiresMs = this.msToMilliseconds(env.JWT_REFRESH_EXPIRY);
    return new Date(Date.now() + expiresMs);
  }

  private msToMilliseconds(value: string): number {
    // Very small parser to avoid adding runtime deps; supports ms/s/m/h/d.
    const match = /^(\d+)(ms|s|m|h|d)$/i.exec(value.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'ms':
        return n;
      case 's':
        return n * 1000;
      case 'm':
        return n * 60 * 1000;
      case 'h':
        return n * 60 * 60 * 1000;
      case 'd':
        return n * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private detectDeviceType(userAgent: string): string {
    const ua = (userAgent || '').toLowerCase();
    if (
      ua.includes('mobile') ||
      ua.includes('android') ||
      ua.includes('iphone')
    ) {
      return 'mobile';
    }
    if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
    return 'desktop';
  }
}
