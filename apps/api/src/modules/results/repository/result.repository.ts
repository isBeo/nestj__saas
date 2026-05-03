// apps/api/src/modules/results/repository/result.repository.ts
import { Injectable } from '@nestjs/common';
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
        term: {
          select: { terminal: true, session: { select: { name: true } } },
        },
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

    const position =
      classResults.findIndex((r) => r.studentId === studentId) + 1;
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
