// apps/api/src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { env } from '../../config/env.config';
import type { StringValue } from 'ms';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PassportModule,
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRY as unknown as StringValue },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
