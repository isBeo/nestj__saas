import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SchoolController } from './controllers/school.controller';
import { SchoolRepository } from './repository/school.repository';
import { SchoolService } from './services/school.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SchoolController],
  providers: [SchoolService, SchoolRepository],
  exports: [SchoolService],
})
export class SchoolModule {}
