// apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { SecurityRecoveryController } from './controllers/security-recovery.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { env } from '../../config/env.config';
import type { StringValue } from 'ms';
import { DeviceSessionService } from './services/device-session.service';
import { SecurityRecoveryService } from './services/security-recovery.service';
import { IdentityVerificationService } from './identity/identity-verification.service';
import { PremblyProvider } from './identity/providers/prembly.provider';
import { DojahProvider } from './identity/providers/dojah.provider';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    NotificationModule,
    RedisModule,
    PassportModule,
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRY as unknown as StringValue },
    }),
  ],
  controllers: [AuthController, SecurityRecoveryController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    DeviceSessionService,
    SecurityRecoveryService,
    IdentityVerificationService,
    PremblyProvider,
    DojahProvider,
  ],
  exports: [AuthService],
})
export class AuthModule {}
