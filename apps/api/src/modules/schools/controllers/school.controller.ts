// apps/api/src/modules/schools/controllers/school.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
  create(@Body() dto: CreateSchoolDto, @CurrentUser('id') userId: string) {
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
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.schoolService.delete(id, userId);
  }
}
