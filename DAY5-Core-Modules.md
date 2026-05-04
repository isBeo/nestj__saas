# 📅 Day 5 — Core Modules: Schools, Students, Teachers, Classrooms & Results
### EduSaas Nigeria | Feature-Based Architecture in Practice

---

## 🎯 Day 5 Goals
- [ ] Understand the Repository Pattern deeply
- [ ] Build the Schools module (full CRUD + multi-tenancy)
- [ ] Build the Students module (enrollment, profile, search)
- [ ] Build the Teachers module (staff management, subject assignment)
- [ ] Build the Classrooms module (class management, form teacher)
- [ ] Build the Results module (grading, publishing, report cards)
- [ ] Implement pagination, filtering, and sorting
- [ ] Apply RBAC guards to every route
- [ ] Write reusable base repository

---

## 🧠 Concept: The Repository Pattern

In Day 3, our service called Prisma directly. That works, but as the app grows it becomes a problem:

```typescript
// ❌ BAD — Service doing too much
@Injectable()
export class StudentService {
  async findAll(schoolId: string) {
    // Raw Prisma query inside the service — hard to reuse, hard to test
    return this.prisma.student.findMany({
      where: { schoolId, deletedAt: null },
      include: { user: true, classroom: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

```typescript
// ✅ GOOD — Repository owns the data access
@Injectable()
export class StudentRepository {
  findAll(schoolId: string, filters: StudentFilters) {
    return this.prisma.student.findMany({ ... });
    // All Prisma queries live HERE
  }
}

@Injectable()
export class StudentService {
  // Service only knows WHAT to do, not HOW to query
  async getStudents(schoolId: string, filters: StudentFilters) {
    const [students, total] = await Promise.all([
      this.studentRepo.findAll(schoolId, filters),
      this.studentRepo.count(schoolId, filters),
    ]);
    return { students, total };
  }
}
```

💡 **WHY Repository Pattern?**
- **Testability** — Mock the repository in service tests, no real DB needed
- **Single Responsibility** — Service = business logic, Repository = data access
- **Reusability** — Multiple services can share one repository
- **Swappability** — Swap Prisma for raw SQL without touching service logic

---

## 🧠 Concept: Multi-Tenancy Guard

Every module that belongs to a school must enforce: **"does this resource belong to the requesting user's school?"**

```typescript
// Without tenancy check — SECURITY HOLE
@Get('students/:id')
getStudent(@Param('id') id: string) {
  return this.studentService.findById(id); // School A teacher sees School B student!
}

// With tenancy check — SECURE
@Get('students/:id')
getStudent(
  @Param('id') id: string,
  @CurrentUser() user: UserPayload,
) {
  return this.studentService.findById(id, user.schoolId); // schoolId always scopes query
}
```

We'll enforce this at the **repository level** — every query includes `schoolId` so it's impossible to accidentally skip it.

---

## 🧱 Step 1 — Base Repository (Reusable Foundation)

```typescript
// apps/api/src/common/repositories/base.repository.ts
import { PrismaService } from '../../database/prisma/prisma.service';

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaService) {}

  // Reusable pagination calculator
  protected getPaginationParams(options: PaginationOptions) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  }

  // Build paginated result shape
  protected buildPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // Standard soft-delete where clause
  protected notDeleted() {
    return { deletedAt: null };
  }
}
```

---

## 🏫 Step 2 — Schools Module

### School Repository

```typescript
// apps/api/src/modules/schools/repository/school.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BaseRepository, PaginationOptions, PaginatedResult } from '../../../common/repositories/base.repository';

export interface SchoolFilters extends PaginationOptions {
  search?: string;    // name or code
  state?: string;
  type?: string;
  isActive?: boolean;
}

@Injectable()
export class SchoolRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findAll(filters: SchoolFilters): Promise<PaginatedResult<any>> {
    const { page, limit, skip } = this.getPaginationParams(filters);

    const where: Prisma.SchoolWhereInput = {
      ...this.notDeleted(),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { code: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...(filters.state && { state: filters.state }),
      ...(filters.type && { type: filters.type as any }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    };

    const [data, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        select: {
          id: true, name: true, code: true, type: true,
          state: true, city: true, phone: true, email: true,
          logo: true, isVerified: true, isActive: true,
          subscriptionPlan: true, createdAt: true,
          _count: {
            select: { students: true, teachers: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.school.count({ where }),
    ]);

    return this.buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    return this.prisma.school.findFirst({
      where: { id, ...this.notDeleted() },
      include: {
        settings: true,
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        _count: {
          select: { students: true, teachers: true, classrooms: true },
        },
      },
    });
  }

  async findByCode(code: string) {
    return this.prisma.school.findUnique({ where: { code } });
  }

  async create(data: Prisma.SchoolCreateInput) {
    return this.prisma.school.create({
      data,
      include: { settings: true },
    });
  }

  async update(id: string, data: Prisma.SchoolUpdateInput) {
    return this.prisma.school.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.school.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
```

### School DTOs

```typescript
// apps/api/src/modules/schools/dto/create-school.dto.ts
import {
  IsString, IsEmail, IsEnum, IsOptional,
  IsUrl, MaxLength, IsNotEmpty, Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SchoolType } from '@prisma/client';

export class CreateSchoolDto {
  @ApiProperty({ example: 'Greenfield Academy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'NURSERY_PRIMARY_SECONDARY', enum: SchoolType })
  @IsEnum(SchoolType)
  type: SchoolType;

  @ApiProperty({ example: '12 Education Lane, GRA' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Port Harcourt' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Rivers' })
  @IsString()
  state: string;

  @ApiProperty({ example: 'Obio-Akpor' })
  @IsString()
  lga: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @Matches(/^\+234[0-9]{10}$/, { message: 'Provide a valid Nigerian phone number' })
  phone: string;

  @ApiProperty({ example: 'info@greenfield.edu.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, example: 'https://greenfield.edu.ng' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ required: false, example: 'Excellence in Education' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motto?: string;
}

// apps/api/src/modules/schools/dto/update-school.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateSchoolDto } from './create-school.dto';

// PartialType makes ALL fields optional — perfect for PATCH
export class UpdateSchoolDto extends PartialType(CreateSchoolDto) {}

// apps/api/src/modules/schools/dto/query-school.dto.ts
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SchoolType } from '@prisma/client';

export class QuerySchoolDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ required: false, enum: SchoolType })
  @IsOptional()
  @IsEnum(SchoolType)
  type?: SchoolType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
```

### School Service

```typescript
// apps/api/src/modules/schools/services/school.service.ts
import {
  Injectable, NotFoundException, ConflictException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { SchoolRepository } from '../repository/school.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { QuerySchoolDto } from '../dto/query-school.dto';
import { UserRole } from '@prisma/client';

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
            F: { min: 0,  max: 39, point: 0.0 },
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
```

### School Controller

```typescript
// apps/api/src/modules/schools/controllers/school.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SchoolService } from '../services/school.service';
import { CreateSchoolDto } from '../dto/create-school.dto';
import { UpdateSchoolDto } from '../dto/update-school.dto';
import { QuerySchoolDto } from '../dto/query-school.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Schools')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'schools', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchoolController {
  constructor(private schoolService: SchoolService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[SUPER_ADMIN] List all schools with filters' })
  findAll(@Query() query: QuerySchoolDto) {
    return this.schoolService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Get school by ID' })
  @ApiParam({ name: 'id', description: 'School ID' })
  findOne(@Param('id') id: string) {
    return this.schoolService.findById(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[SUPER_ADMIN] Create a new school' })
  create(
    @Body() dto: CreateSchoolDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.schoolService.create(dto, userId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Update school details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.schoolService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[SUPER_ADMIN] Soft-delete a school' })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.schoolService.delete(id, userId);
  }
}
```

---

## 👨‍🎓 Step 3 — Students Module

### Student Repository

```typescript
// apps/api/src/modules/students/repository/student.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BaseRepository, PaginationOptions, PaginatedResult } from '../../../common/repositories/base.repository';

export interface StudentFilters extends PaginationOptions {
  search?: string;         // name or admission number
  classroomId?: string;
  isActive?: boolean;
  gender?: string;
}

// What we return for student list — never return passwords
const studentSelect = {
  id: true,
  admissionNumber: true,
  admissionDate: true,
  isActive: true,
  createdAt: true,
  user: {
    select: {
      id: true, firstName: true, lastName: true,
      email: true, phone: true, avatar: true,
      gender: true, dateOfBirth: true, address: true,
    },
  },
  classroom: {
    select: { id: true, name: true, level: true },
  },
  parent: {
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
    },
  },
};

@Injectable()
export class StudentRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findAll(schoolId: string, filters: StudentFilters): Promise<PaginatedResult<any>> {
    const { page, limit, skip } = this.getPaginationParams(filters);

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...this.notDeleted(),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.classroomId && { classroomId: filters.classroomId }),
      ...(filters.search && {
        OR: [
          { admissionNumber: { contains: filters.search, mode: 'insensitive' } },
          { user: { firstName: { contains: filters.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }),
      ...(filters.gender && {
        user: { gender: filters.gender as any },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: studentSelect,
        orderBy: { user: { lastName: 'asc' } },
        skip,
        take: limit,
      }),
      this.prisma.student.count({ where }),
    ]);

    return this.buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string, schoolId: string) {
    return this.prisma.student.findFirst({
      where: { id, schoolId, ...this.notDeleted() },
      select: {
        ...studentSelect,
        results: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { subject: true, term: true },
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        invoices: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
        },
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.student.findUnique({
      where: { userId },
      include: { user: true, classroom: true, school: true },
    });
  }

  async create(data: {
    userId: string;
    schoolId: string;
    classroomId: string;
    admissionNumber: string;
    admissionDate: Date;
    parentId?: string;
  }) {
    return this.prisma.student.create({
      data,
      select: studentSelect,
    });
  }

  async update(id: string, schoolId: string, data: Prisma.StudentUpdateInput) {
    return this.prisma.student.update({
      where: { id },
      data,
      select: studentSelect,
    });
  }

  async countBySchool(schoolId: string) {
    return this.prisma.student.count({ where: { schoolId, isActive: true } });
  }

  // Generate next admission number for a school
  async generateAdmissionNumber(schoolId: string, year: number): Promise<string> {
    const count = await this.prisma.student.count({ where: { schoolId } });
    const seq = String(count + 1).padStart(4, '0');
    return `STU-${year}-${seq}`;  // e.g., STU-2024-0001
  }
}
```

### Enroll Student DTO

```typescript
// apps/api/src/modules/students/dto/enroll-student.dto.ts
import {
  IsString, IsEmail, IsEnum, IsOptional,
  IsDateString, IsNotEmpty, Matches, IsISO8601,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class EnrollStudentDto {
  // User account info
  @ApiProperty({ example: 'emeka@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Emeka' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Obi' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'Chukwuemeka', required: false })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ example: 'MALE', enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: '2010-05-15' })
  @IsISO8601()
  dateOfBirth: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @Matches(/^\+234[0-9]{10}$/)
  phone?: string;

  // Enrollment info
  @ApiProperty({ example: 'classroom-id-here' })
  @IsString()
  @IsNotEmpty()
  classroomId: string;

  @ApiProperty({ example: '2024-09-01' })
  @IsISO8601()
  admissionDate: string;

  @ApiProperty({ example: 'parent-id-here', required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}

// apps/api/src/modules/students/dto/query-student.dto.ts
import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class QueryStudentDto {
  @ApiProperty({ required: false, description: 'Search by name or admission number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiProperty({ required: false, enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
```

### Student Service

```typescript
// apps/api/src/modules/students/services/student.service.ts
import {
  Injectable, NotFoundException, ConflictException,
  ForbiddenException, Logger, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StudentRepository } from '../repository/student.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { NotificationGateway } from '../../notifications/gateways/notification.gateway';
import { EnrollStudentDto } from '../dto/enroll-student.dto';
import { QueryStudentDto } from '../dto/query-student.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private prisma: PrismaService,
    private studentRepo: StudentRepository,
    private auditLog: AuditLogService,
    private notificationGateway: NotificationGateway,
  ) {}

  async findAll(schoolId: string, query: QueryStudentDto) {
    const result = await this.studentRepo.findAll(schoolId, query);
    return { data: result };
  }

  async findById(id: string, schoolId: string) {
    const student = await this.studentRepo.findById(id, schoolId);
    if (!student) throw new NotFoundException('Student not found');
    return { data: student };
  }

  async enroll(schoolId: string, dto: EnrollStudentDto, enrolledByUserId: string) {
    // 1. Check classroom belongs to this school
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: dto.classroomId, schoolId },
    });

    if (!classroom) {
      throw new BadRequestException('Classroom not found in this school');
    }

    // 2. Check email not already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // 3. Generate admission number
    const year = new Date().getFullYear();
    const admissionNumber = await this.studentRepo.generateAdmissionNumber(schoolId, year);

    // 4. Default password = admissionNumber (student changes on first login)
    const defaultPassword = await bcrypt.hash(admissionNumber, 12);

    // 5. Create user + student profile atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          password: defaultPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          middleName: dto.middleName,
          gender: dto.gender,
          dateOfBirth: new Date(dto.dateOfBirth),
          role: UserRole.STUDENT,
          isEmailVerified: true, // School admin enrolls — no self-verification needed
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          schoolId,
          classroomId: dto.classroomId,
          admissionNumber,
          admissionDate: new Date(dto.admissionDate),
          parentId: dto.parentId,
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          classroom: { select: { name: true } },
        },
      });

      return student;
    });

    // 6. Audit log
    await this.auditLog.log({
      action: 'STUDENT_ENROLLED',
      entity: 'Student',
      entityId: result.id,
      userId: enrolledByUserId,
      newValue: {
        admissionNumber,
        classroomId: dto.classroomId,
        email: dto.email,
      },
    });

    this.logger.log(
      `Student enrolled: ${result.user.firstName} ${result.user.lastName} [${admissionNumber}]`,
    );

    return {
      data: {
        ...result,
        defaultPassword: admissionNumber, // Return once so admin can share with student
      },
      message: `Student enrolled. Default password is the admission number: ${admissionNumber}`,
    };
  }

  async transferClass(
    studentId: string,
    newClassroomId: string,
    schoolId: string,
    transferredByUserId: string,
  ) {
    const student = await this.studentRepo.findById(studentId, schoolId);
    if (!student) throw new NotFoundException('Student not found');

    const newClassroom = await this.prisma.classroom.findFirst({
      where: { id: newClassroomId, schoolId },
    });

    if (!newClassroom) {
      throw new BadRequestException('Target classroom not found in this school');
    }

    const updated = await this.studentRepo.update(studentId, schoolId, {
      classroomId: newClassroomId,
    });

    await this.auditLog.log({
      action: 'STUDENT_TRANSFERRED',
      entity: 'Student',
      entityId: studentId,
      userId: transferredByUserId,
      oldValue: { classroomId: (student as any).classroom?.id },
      newValue: { classroomId: newClassroomId },
    });

    return { data: updated, message: 'Student transferred successfully' };
  }

  async getStatsBySchool(schoolId: string) {
    const [total, byGender, byClassroom] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, isActive: true } }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: { studentProfile: { schoolId }, role: 'STUDENT' },
        _count: true,
      }),
      this.prisma.student.groupBy({
        by: ['classroomId'],
        where: { schoolId, isActive: true },
        _count: true,
      }),
    ]);

    return { data: { total, byGender, byClassroom } };
  }
}
```

### Student Controller

```typescript
// apps/api/src/modules/students/controllers/student.controller.ts
import {
  Controller, Get, Post, Patch, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StudentService } from '../services/student.service';
import { EnrollStudentDto } from '../dto/enroll-student.dto';
import { QueryStudentDto } from '../dto/query-student.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Students')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'students', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentController {
  constructor(private studentService: StudentService) {}

  @Get()
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all students in a school' })
  findAll(
    @Query() query: QueryStudentDto,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    return this.studentService.findAll(schoolId, query);
  }

  @Get('stats')
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get student statistics for the school' })
  getStats(@CurrentUser('schoolId') schoolId: string) {
    return this.studentService.getStatsBySchool(schoolId);
  }

  @Get(':id')
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.PARENT, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get student profile with results and attendance' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    return this.studentService.findById(id, schoolId);
  }

  @Post('enroll')
  @Roles(UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: '[SCHOOL_ADMIN] Enroll a new student' })
  enroll(
    @Body() dto: EnrollStudentDto,
    @CurrentUser('schoolId') schoolId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.studentService.enroll(schoolId, dto, userId);
  }

  @Patch(':id/transfer')
  @Roles(UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Transfer student to a different classroom' })
  transfer(
    @Param('id') studentId: string,
    @Body('classroomId') classroomId: string,
    @CurrentUser('schoolId') schoolId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.studentService.transferClass(studentId, classroomId, schoolId, userId);
  }
}
```

---

## 👨‍🏫 Step 4 — Teachers Module

```typescript
// apps/api/src/modules/teachers/repository/teacher.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BaseRepository, PaginationOptions, PaginatedResult } from '../../../common/repositories/base.repository';

export interface TeacherFilters extends PaginationOptions {
  search?: string;
  classroomId?: string;
}

const teacherSelect = {
  id: true, staffId: true, employeeDate: true,
  qualification: true, specialization: true,
  user: {
    select: {
      id: true, firstName: true, lastName: true,
      email: true, phone: true, avatar: true, gender: true,
    },
  },
  formClassroom: { select: { id: true, name: true, level: true } },
  subjectAssignments: {
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classroom: { select: { id: true, name: true } },
    },
  },
};

@Injectable()
export class TeacherRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findAll(schoolId: string, filters: TeacherFilters): Promise<PaginatedResult<any>> {
    const { page, limit, skip } = this.getPaginationParams(filters);

    const where: Prisma.TeacherWhereInput = {
      schoolId,
      ...(filters.search && {
        OR: [
          { staffId: { contains: filters.search, mode: 'insensitive' } },
          { user: { firstName: { contains: filters.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        select: teacherSelect,
        orderBy: { user: { lastName: 'asc' } },
        skip,
        take: limit,
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return this.buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string, schoolId: string) {
    return this.prisma.teacher.findFirst({
      where: { id, schoolId },
      select: teacherSelect,
    });
  }

  async create(data: Prisma.TeacherCreateInput) {
    return this.prisma.teacher.create({ data, select: teacherSelect });
  }

  async generateStaffId(schoolId: string): Promise<string> {
    const count = await this.prisma.teacher.count({ where: { schoolId } });
    const year = new Date().getFullYear();
    const seq = String(count + 1).padStart(3, '0');
    return `TCH-${year}-${seq}`;
  }
}
```

```typescript
// apps/api/src/modules/teachers/dto/add-teacher.dto.ts
import {
  IsString, IsEmail, IsEnum, IsOptional,
  IsISO8601, IsNotEmpty, Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class AddTeacherDto {
  @ApiProperty({ example: 'ngozi@school.edu.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Ngozi' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Adeyemi' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'FEMALE', enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: '+2348098765432' })
  @IsOptional()
  @Matches(/^\+234[0-9]{10}$/)
  phone?: string;

  @ApiProperty({ example: 'B.Sc Mathematics, University of Lagos' })
  @IsOptional()
  @IsString()
  qualification?: string;

  @ApiProperty({ example: 'Mathematics & Further Mathematics' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiProperty({ example: '2024-01-15' })
  @IsISO8601()
  employeeDate: string;
}
```

```typescript
// apps/api/src/modules/teachers/services/teacher.service.ts
import {
  Injectable, NotFoundException,
  ConflictException, Logger, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TeacherRepository } from '../repository/teacher.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { AddTeacherDto } from '../dto/add-teacher.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class TeacherService {
  private readonly logger = new Logger(TeacherService.name);

  constructor(
    private prisma: PrismaService,
    private teacherRepo: TeacherRepository,
    private auditLog: AuditLogService,
  ) {}

  async findAll(schoolId: string, query: any) {
    return { data: await this.teacherRepo.findAll(schoolId, query) };
  }

  async findById(id: string, schoolId: string) {
    const teacher = await this.teacherRepo.findById(id, schoolId);
    if (!teacher) throw new NotFoundException('Teacher not found');
    return { data: teacher };
  }

  async addTeacher(schoolId: string, dto: AddTeacherDto, addedByUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const staffId = await this.teacherRepo.generateStaffId(schoolId);
    const defaultPassword = await bcrypt.hash(staffId, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          password: defaultPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          gender: dto.gender,
          role: UserRole.TEACHER,
          isEmailVerified: true,
        },
      });

      const teacher = await tx.teacher.create({
        data: {
          userId: user.id,
          schoolId,
          staffId,
          qualification: dto.qualification,
          specialization: dto.specialization,
          employeeDate: new Date(dto.employeeDate),
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      return teacher;
    });

    await this.auditLog.log({
      action: 'TEACHER_ADDED',
      entity: 'Teacher',
      entityId: result.id,
      userId: addedByUserId,
      newValue: { staffId, email: dto.email },
    });

    return {
      data: { ...result, defaultPassword: staffId },
      message: `Teacher added. Default password is their staff ID: ${staffId}`,
    };
  }

  async assignSubject(
    teacherId: string,
    schoolId: string,
    classroomId: string,
    subjectId: string,
    assignedByUserId: string,
  ) {
    // Verify teacher belongs to school
    const teacher = await this.teacherRepo.findById(teacherId, schoolId);
    if (!teacher) throw new NotFoundException('Teacher not found');

    // Check if already assigned
    const existing = await this.prisma.classroomSubject.findUnique({
      where: { classroomId_subjectId: { classroomId, subjectId } },
    });

    if (existing) {
      // Update teacher if different
      if (existing.teacherId !== teacherId) {
        await this.prisma.classroomSubject.update({
          where: { classroomId_subjectId: { classroomId, subjectId } },
          data: { teacherId },
        });
        return { data: null, message: 'Subject re-assigned to new teacher' };
      }
      throw new ConflictException('Teacher is already assigned to this subject in this classroom');
    }

    await this.prisma.classroomSubject.create({
      data: { classroomId, subjectId, teacherId },
    });

    await this.auditLog.log({
      action: 'SUBJECT_ASSIGNED',
      entity: 'Teacher',
      entityId: teacherId,
      userId: assignedByUserId,
      newValue: { classroomId, subjectId },
    });

    return { data: null, message: 'Subject assigned successfully' };
  }
}
```

---

## 📊 Step 5 — Results Module

```typescript
// apps/api/src/modules/results/repository/result.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class ResultRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findByStudentAndTerm(studentId: string, termId: string) {
    return this.prisma.result.findMany({
      where: { studentId, termId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        term: { select: { terminal: true, session: { select: { name: true } } } },
      },
      orderBy: { subject: { name: 'asc' } },
    });
  }

  async upsertResult(data: {
    studentId: string;
    subjectId: string;
    termId: string;
    continuousAssessment?: number;
    examScore?: number;
    teacherComment?: string;
  }) {
    const totalScore = (data.continuousAssessment ?? 0) + (data.examScore ?? 0);
    const { grade, gradePoint } = this.calculateGrade(totalScore);

    return this.prisma.result.upsert({
      where: {
        studentId_subjectId_termId: {
          studentId: data.studentId,
          subjectId: data.subjectId,
          termId: data.termId,
        },
      },
      create: {
        studentId: data.studentId,
        subjectId: data.subjectId,
        termId: data.termId,
        continuousAssessment: data.continuousAssessment ?? 0,
        examScore: data.examScore ?? 0,
        totalScore,
        grade,
        gradePoint,
        teacherComment: data.teacherComment,
      },
      update: {
        continuousAssessment: data.continuousAssessment,
        examScore: data.examScore,
        totalScore,
        grade,
        gradePoint,
        teacherComment: data.teacherComment,
      },
    });
  }

  async publishTermResults(termId: string, schoolId: string) {
    // Publish all results for this term in this school
    return this.prisma.result.updateMany({
      where: {
        termId,
        student: { schoolId },
        isPublished: false,
      },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });
  }

  async getReportCard(studentId: string, termId: string) {
    const results = await this.findByStudentAndTerm(studentId, termId);

    // Calculate position in class
    const classId = await this.prisma.student
      .findUnique({ where: { id: studentId }, select: { classroomId: true } })
      .then((s) => s?.classroomId);

    const classResults = await this.prisma.result.groupBy({
      by: ['studentId'],
      where: { termId, student: { classroomId: classId! } },
      _sum: { totalScore: true },
      orderBy: { _sum: { totalScore: 'desc' } },
    });

    const position = classResults.findIndex((r) => r.studentId === studentId) + 1;
    const totalStudents = classResults.length;

    const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
    const average = results.length > 0 ? totalScore / results.length : 0;

    return {
      results,
      summary: {
        totalScore,
        average: parseFloat(average.toFixed(2)),
        position,
        totalStudents,
        subjects: results.length,
      },
    };
  }

  // Standard Nigerian grading system
  private calculateGrade(score: number): { grade: string; gradePoint: number } {
    if (score >= 70) return { grade: 'A', gradePoint: 5.0 };
    if (score >= 60) return { grade: 'B', gradePoint: 4.0 };
    if (score >= 50) return { grade: 'C', gradePoint: 3.0 };
    if (score >= 45) return { grade: 'D', gradePoint: 2.0 };
    if (score >= 40) return { grade: 'E', gradePoint: 1.0 };
    return { grade: 'F', gradePoint: 0.0 };
  }
}
```

```typescript
// apps/api/src/modules/results/services/result.service.ts
import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ResultRepository } from '../repository/result.repository';
import { AuditLogService } from '../../audit/audit-log.service';
import { NotificationGateway } from '../../notifications/gateways/notification.gateway';

export class EnterResultDto {
  studentId: string;
  subjectId: string;
  termId: string;
  continuousAssessment?: number;
  examScore?: number;
  teacherComment?: string;
}

@Injectable()
export class ResultService {
  private readonly logger = new Logger(ResultService.name);

  constructor(
    private prisma: PrismaService,
    private resultRepo: ResultRepository,
    private auditLog: AuditLogService,
    private notificationGateway: NotificationGateway,
  ) {}

  async enterResult(dto: EnterResultDto, enteredByUserId: string) {
    const result = await this.resultRepo.upsertResult(dto);

    await this.auditLog.log({
      action: 'RESULT_ENTERED',
      entity: 'Result',
      entityId: result.id,
      userId: enteredByUserId,
      newValue: {
        studentId: dto.studentId,
        subjectId: dto.subjectId,
        ca: dto.continuousAssessment,
        exam: dto.examScore,
        total: result.totalScore,
        grade: result.grade,
      },
    });

    return { data: result, message: 'Result saved successfully' };
  }

  async getStudentResults(studentId: string, termId: string, schoolId: string) {
    // Verify student belongs to school
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) throw new NotFoundException('Student not found');

    const results = await this.resultRepo.findByStudentAndTerm(studentId, termId);
    return { data: results };
  }

  async getReportCard(studentId: string, termId: string, schoolId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        classroom: { select: { name: true } },
      },
    });

    if (!student) throw new NotFoundException('Student not found');

    const reportCard = await this.resultRepo.getReportCard(studentId, termId);

    return {
      data: {
        student: {
          name: `${student.user.firstName} ${student.user.lastName}`,
          admissionNumber: student.admissionNumber,
          classroom: student.classroom.name,
        },
        ...reportCard,
      },
    };
  }

  async publishResults(termId: string, schoolId: string, publishedByUserId: string) {
    const { count } = await this.resultRepo.publishTermResults(termId, schoolId);

    // Notify all students in the school that results are published
    const students = await this.prisma.student.findMany({
      where: { schoolId, isActive: true },
      select: { userId: true },
    });

    // Send notification to each student (non-blocking)
    students.forEach(({ userId }) => {
      this.notificationGateway
        .sendNotification(userId, {
          title: 'Results Published!',
          body: 'Your term results are now available. Check your report card.',
          type: 'RESULT_PUBLISHED',
        })
        .catch(() => {}); // Ignore failures — don't block
    });

    await this.auditLog.log({
      action: 'RESULTS_PUBLISHED',
      entity: 'Term',
      entityId: termId,
      userId: publishedByUserId,
      newValue: { count, termId },
    });

    return { data: { count }, message: `${count} results published successfully` };
  }
}
```

```typescript
// apps/api/src/modules/results/controllers/result.controller.ts
import {
  Controller, Get, Post, Body,
  Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ResultService, EnterResultDto } from '../services/result.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Results')
@ApiBearerAuth('JWT-auth')
@Controller({ path: 'results', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResultController {
  constructor(private resultService: ResultService) {}

  @Post()
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Enter or update a student result' })
  enterResult(
    @Body() dto: EnterResultDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.resultService.enterResult(dto, userId);
  }

  @Get('students/:studentId/terms/:termId')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.STUDENT, UserRole.PARENT)
  @ApiOperation({ summary: 'Get all results for a student in a term' })
  getStudentResults(
    @Param('studentId') studentId: string,
    @Param('termId') termId: string,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    return this.resultService.getStudentResults(studentId, termId, schoolId);
  }

  @Get('students/:studentId/report-card/:termId')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.STUDENT, UserRole.PARENT)
  @ApiOperation({ summary: 'Get student report card with class position' })
  getReportCard(
    @Param('studentId') studentId: string,
    @Param('termId') termId: string,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    return this.resultService.getReportCard(studentId, termId, schoolId);
  }

  @Post('publish/:termId')
  @Roles(UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: '[SCHOOL_ADMIN] Publish all results for a term' })
  publishResults(
    @Param('termId') termId: string,
    @CurrentUser('schoolId') schoolId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.resultService.publishResults(termId, schoolId, userId);
  }
}
```

---

## 🔗 Step 6 — Wire All Modules into AppModule

```typescript
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
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

---

## 📁 Feature Module Pattern (School as example)

Every module follows this exact structure — learn it once, apply everywhere:

```typescript
// apps/api/src/modules/schools/school.module.ts
import { Module } from '@nestjs/common';
import { SchoolController } from './controllers/school.controller';
import { SchoolService } from './services/school.service';
import { SchoolRepository } from './repository/school.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],  // Import what you need
  controllers: [SchoolController],
  providers: [SchoolService, SchoolRepository],
  exports: [SchoolService],  // Export what others might need
})
export class SchoolModule {}
```

---

## 📝 Day 5 Checklist

- [ ] `BaseRepository` built with pagination helpers
- [ ] `SchoolModule` — full CRUD, multi-tenant, soft delete
- [ ] `StudentModule` — enrollment via transaction, class transfer, stats
- [ ] `TeacherModule` — staff onboarding, subject assignment
- [ ] `ResultModule` — grade entry, report card, publish with notifications
- [ ] All routes protected with correct `@Roles()`
- [ ] All mutations write to `AuditLog`
- [ ] `AppModule` wired with all feature modules
- [ ] Swagger docs visible for all endpoints

---

## 🏆 Senior Patterns Used Today

| Pattern | Where | Why |
|---------|-------|-----|
| **Repository Pattern** | All modules | Separates data access from business logic |
| **Base Repository** | `BaseRepository` | DRY — write pagination once, use everywhere |
| **PartialType (DTO)** | `UpdateSchoolDto` | Automatic PATCH DTOs — no repetition |
| **Prisma $transaction** | Enroll student, Add teacher | Atomic multi-step writes |
| **groupBy for stats** | `getStatsBySchool` | Efficient aggregation without loading all records |
| **upsert for results** | `ResultRepository` | Idempotent — safe to call multiple times |
| **Promise.all** | All list + count queries | Parallel queries — 2x faster than sequential |
| **Select shape constants** | `studentSelect`, `teacherSelect` | Consistent, password-safe projections |
| **Fire-and-forget notifications** | `publishResults` | Don't block response for non-critical side effects |
| **Tenant scoping in repo** | Every `findAll`/`findById` | Impossible to accidentally leak cross-school data |

---

*Next: Day 6 — Next.js Frontend: App Router, Auth UI, Dashboard & Protected Routes*
