// apps/api/src/modules/results/controllers/result.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
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
  enterResult(@Body() dto: EnterResultDto, @CurrentUser('id') userId: string) {
    return this.resultService.enterResult(dto, userId);
  }

  @Get('students/:studentId/terms/:termId')
  @Roles(
    UserRole.TEACHER,
    UserRole.SCHOOL_ADMIN,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  @ApiOperation({ summary: 'Get all results for a student in a term' })
  getStudentResults(
    @Param('studentId') studentId: string,
    @Param('termId') termId: string,
    @CurrentUser('schoolId') schoolId: string,
  ) {
    return this.resultService.getStudentResults(studentId, termId, schoolId);
  }

  @Get('students/:studentId/report-card/:termId')
  @Roles(
    UserRole.TEACHER,
    UserRole.SCHOOL_ADMIN,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
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
