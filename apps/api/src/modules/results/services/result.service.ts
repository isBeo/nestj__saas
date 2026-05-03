import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) throw new NotFoundException('Student not found');

    const results = await this.resultRepo.findByStudentAndTerm(
      studentId,
      termId,
    );
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

  async publishResults(
    termId: string,
    schoolId: string,
    publishedByUserId: string,
  ) {
    const { count } = await this.resultRepo.publishTermResults(
      termId,
      schoolId,
    );

    const students = await this.prisma.student.findMany({
      where: { schoolId, isActive: true },
      select: { userId: true },
    });

    for (const { userId } of students) {
      try {
        this.notificationGateway.sendNotification(userId, {
          title: 'Results Published!',
          body: 'Your term results are now available. Check your report card.',
          type: 'RESULT_PUBLISHED',
        });
      } catch {
        // ignore failures — don't block
      }
    }

    await this.auditLog.log({
      action: 'RESULTS_PUBLISHED',
      entity: 'Term',
      entityId: termId,
      userId: publishedByUserId,
      newValue: { count, termId },
    });

    return {
      data: { count },
      message: `${count} results published successfully`,
    };
  }
}
