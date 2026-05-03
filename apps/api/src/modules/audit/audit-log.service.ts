// apps/api/src/modules/audit/audit-log.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  log(entry: AuditLogEntry): Promise<void> {
    void this.prisma.auditLog
      .create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          userId: entry.userId,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      })
      .catch((err) => {
        console.error('AuditLog write failed:', err.message);
      });

    return Promise.resolve();
  }
}
