// apps/api/src/modules/students/services/student.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
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

  async enroll(
    schoolId: string,
    dto: EnrollStudentDto,
    enrolledByUserId: string,
  ) {
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
    const admissionNumber = await this.studentRepo.generateAdmissionNumber(
      schoolId,
      year,
    );

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
      throw new BadRequestException(
        'Target classroom not found in this school',
      );
    }

    const updated = await this.studentRepo.update(studentId, schoolId, {
      classroom: { connect: { id: newClassroomId } },
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
