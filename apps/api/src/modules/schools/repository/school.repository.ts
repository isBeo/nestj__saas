// apps/api/src/modules/schools/repository/school.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BaseRepository,
  PaginationOptions,
  PaginatedResult,
} from '../../../common/repositories/base.repository';

export interface SchoolFilters extends PaginationOptions {
  search?: string; // name or code
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
          id: true,
          name: true,
          code: true,
          type: true,
          state: true,
          city: true,
          phone: true,
          email: true,
          logo: true,
          isVerified: true,
          isActive: true,
          subscriptionPlan: true,
          createdAt: true,
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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
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
