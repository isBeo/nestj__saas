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
      throw new BadRequestException(
        'OTP expired or not found. Request a new one.',
      );
    }

    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many failed attempts. Request a new OTP.',
      );
    }

    if (otpRecord.code !== code) {
      // Increment attempts
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        `Invalid OTP. ${this.MAX_ATTEMPTS - otpRecord.attempts - 1} attempts remaining.`,
      );
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
