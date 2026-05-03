// apps/api/src/modules/students/controllers/student.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
  @Roles(
    UserRole.SCHOOL_ADMIN,
    UserRole.TEACHER,
    UserRole.PARENT,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get student profile with results and attendance' })
  @ApiParam({ name: 'id', description: 'Student ID' })
  findOne(@Param('id') id: string, @CurrentUser('schoolId') schoolId: string) {
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
    return this.studentService.transferClass(
      studentId,
      classroomId,
      schoolId,
      userId,
    );
  }
}
