import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { ResultController } from './controllers/result.controller';
import { ResultRepository } from './repository/result.repository';
import { ResultService } from './services/result.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule],
  controllers: [ResultController],
  providers: [ResultService, ResultRepository],
  exports: [ResultService],
})
export class ResultModule {}
