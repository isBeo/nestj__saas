// apps/api/src/modules/schools/services/school.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SchoolRepository } from '../repository/school.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { QuerySchoolDto } from '../dto/query-school.dto';

// Generate unique school code: EDU-LAG-001
function generateSchoolCode(state: string, index: number): string {
  const stateCode = state.substring(0, 3).toUpperCase();
  const seq = String(index).padStart(3, '0');
  return `EDU-${stateCode}-${seq}`;
}

@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);

  constructor(
    private schoolRepo: SchoolRepository,
    private auditLog: AuditLogService,
  ) {}

  async findAll(query: QuerySchoolDto) {
    const result = await this.schoolRepo.findAll(query);
    return { data: result };
  }

  async findById(id: string) {
    const school = await this.schoolRepo.findById(id);
    if (!school) throw new NotFoundException('School not found');
    return { data: school };
  }

  async create(dto: CreateSchoolDto, createdByUserId: string) {
    // Generate a unique school code
    const count = await this.schoolRepo['prisma'].school.count();
    const code = generateSchoolCode(dto.state, count + 1);

    // Check code uniqueness (very unlikely to collide, but be safe)
    const existing = await this.schoolRepo.findByCode(code);
    if (existing) {
      throw new ConflictException('School code collision — please try again');
    }

    const school = await this.schoolRepo.create({
      ...dto,
      code,
      settings: {
        // Create default settings alongside the school
        create: {
          gradingSystem: JSON.stringify({
            A: { min: 70, max: 100, point: 5.0 },
            B: { min: 60, max: 69, point: 4.0 },
            C: { min: 50, max: 59, point: 3.0 },
            D: { min: 45, max: 49, point: 2.0 },
            E: { min: 40, max: 44, point: 1.0 },
            F: { min: 0, max: 39, point: 0.0 },
          }),
        },
      },
    });

    await this.auditLog.log({
      action: 'SCHOOL_CREATED',
      entity: 'School',
      entityId: school.id,
      userId: createdByUserId,
      newValue: { name: school.name, code: school.code },
    });

    this.logger.log(`School created: ${school.name} [${school.code}]`);

    return { data: school, message: 'School created successfully' };
  }

  async update(id: string, dto: UpdateSchoolDto, updatedByUserId: string) {
    const school = await this.schoolRepo.findById(id);
    if (!school) throw new NotFoundException('School not found');

    const updated = await this.schoolRepo.update(id, dto);

    await this.auditLog.log({
      action: 'SCHOOL_UPDATED',
      entity: 'School',
      entityId: id,
      userId: updatedByUserId,
      oldValue: school as any,
      newValue: dto as any,
    });

    return { data: updated, message: 'School updated successfully' };
  }

  async delete(id: string, deletedByUserId: string) {
    const school = await this.schoolRepo.findById(id);
    if (!school) throw new NotFoundException('School not found');

    await this.schoolRepo.softDelete(id);

    await this.auditLog.log({
      action: 'SCHOOL_DELETED',
      entity: 'School',
      entityId: id,
      userId: deletedByUserId,
    });

    return { data: null, message: 'School deleted successfully' };
  }
}
