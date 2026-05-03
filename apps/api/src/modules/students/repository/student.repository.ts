// apps/api/src/modules/students/repository/student.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from '../../../common/repositories/base.repository';

export interface StudentFilters extends PaginationOptions {
  search?: string; // name or admission number
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
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatar: true,
      gender: true,
      dateOfBirth: true,
      address: true,
    },
  },
  classroom: {
    select: { id: true, name: true, level: true },
  },
  parent: {
    select: {
      id: true,
      user: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
    },
  },
};

@Injectable()
export class StudentRepository extends BaseRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findAll(
    schoolId: string,
    filters: StudentFilters,
  ): Promise<PaginatedResult<any>> {
    const { page, limit, skip } = this.getPaginationParams(filters);

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...this.notDeleted(),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.classroomId && { classroomId: filters.classroomId }),
      ...(filters.search && {
        OR: [
          {
            admissionNumber: { contains: filters.search, mode: 'insensitive' },
          },
          {
            user: {
              firstName: { contains: filters.search, mode: 'insensitive' },
            },
          },
          {
            user: {
              lastName: { contains: filters.search, mode: 'insensitive' },
            },
          },
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
  async generateAdmissionNumber(
    schoolId: string,
    year: number,
  ): Promise<string> {
    const count = await this.prisma.student.count({ where: { schoolId } });
    const seq = String(count + 1).padStart(4, '0');
    return `STU-${year}-${seq}`; // e.g., STU-2024-0001
  }
}
