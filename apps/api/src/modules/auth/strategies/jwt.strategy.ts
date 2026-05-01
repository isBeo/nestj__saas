// apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { env } from '../../../config/env.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_SECRET,
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // Check Redis first (fast path — avoids DB hit on every request)
    const cachedSession = await this.redis.get(`session:${payload.sub}`);

    if (!cachedSession) {
      // Fallback to DB
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, role: true, managedSchoolId: true },
      });

      if (!user) {
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      return user;
    }

    const session = JSON.parse(cachedSession);
    return {
      id: payload.sub,
      email: payload.email,
      role: session.role,
    };
  }
}
