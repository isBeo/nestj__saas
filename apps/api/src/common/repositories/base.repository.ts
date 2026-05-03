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
