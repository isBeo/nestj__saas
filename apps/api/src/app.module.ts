// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { SchoolModule } from './modules/schools/school.module';
import { StudentModule } from './modules/students/student.module';
import { TeacherModule } from './modules/teachers/teacher.module';
import { ResultModule } from './modules/results/result.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 100 }]),

    // Infrastructure
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    SchoolModule,
    StudentModule,
    TeacherModule,
    ResultModule,
    NotificationModule,
    AuditModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
