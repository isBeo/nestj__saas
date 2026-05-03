import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { StudentController } from './controllers/student.controller';
import { StudentRepository } from './repository/student.repository';
import { StudentService } from './services/student.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule],
  controllers: [StudentController],
  providers: [StudentService, StudentRepository],
  exports: [StudentService],
})
export class StudentModule {}
