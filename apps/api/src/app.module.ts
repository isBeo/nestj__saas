// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Rate limiting: max 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000, // 60 seconds
        limit: 100,
      },
    ]),

    PrismaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Apply globally
    },
  ],
})
export class AppModule {}
