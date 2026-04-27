# 📅 Day 2 — Database Design & Prisma Schema

### EduSaas Nigeria | Full Relational Design

---

## 🎯 Day 2 Goals

- [ ] Design the complete EduSaas database ERD
- [ ] Write the full Prisma schema
- [ ] Run first migration
- [ ] Write database seeds
- [ ] Learn Prisma query patterns
- [ ] Set up PrismaService in NestJS

---

## 🧠 Database Design Principles

Before writing any schema, senior engineers ask:

1. **What are the entities?** (User, School, Student, Exam...)
2. **What are the relationships?** (School has many Students)
3. **What are the cardinalities?** (One-to-one, one-to-many, many-to-many)
4. **What data needs indexes?** (Fields used in WHERE clauses)
5. **What is the multi-tenancy strategy?** (How do we isolate school data?)

### Multi-Tenancy in EduSaas

EduSaas serves many schools (tenants) on one database. We use **Row-Level Isolation**:

```
Every record that belongs to a school has a `schoolId` foreign key.
Every query is filtered by `schoolId`.
```

This means a Teacher at School A can **never** accidentally see data from School B — enforced at the database level.

---

## 📊 Entity Relationship Overview

```
SUPER_ADMIN
    │
    ├── manages many SCHOOLs
    │
SCHOOL
    ├── has one SCHOOL_ADMIN (User)
    ├── has many TEACHERs (User)
    ├── has many STUDENTs
    ├── has many PARENTs (User)
    ├── has many CLASSROOMs
    ├── has many SUBJECTs
    ├── has many EXAMs
    └── has many INVOICEs

STUDENT
    ├── belongs to SCHOOL
    ├── belongs to CLASSROOM
    ├── has one PARENT
    ├── has many RESULTS
    ├── has many ATTENDANCES
    └── takes many EXAMs

EXAM
    ├── belongs to SCHOOL
    ├── has many QUESTIONs
    └── has many RESULTS

USER (polymorphic — one table for all roles)
    ├── has one DEVICE_SESSION
    └── has many NOTIFICATIONS
```

---

## 🏗️ Complete Prisma Schema

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ===========================================
// ENUMS
// ===========================================

enum UserRole {
  SUPER_ADMIN
  SCHOOL_ADMIN
  TEACHER
  STUDENT
  PARENT
}

enum SchoolType {
  NURSERY
  PRIMARY
  SECONDARY
  NURSERY_PRIMARY            // Combined
  PRIMARY_SECONDARY          // Combined
  NURSERY_PRIMARY_SECONDARY  // All levels
}

enum Gender {
  MALE
  FEMALE
}

enum ExamType {
  CBT           // Computer Based Test
  WRITTEN
  ORAL
  PRACTICAL
}

enum ExamStatus {
  DRAFT
  PUBLISHED
  ONGOING
  COMPLETED
  CANCELLED
}

enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  SHORT_ANSWER
  ESSAY
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}

enum NotificationChannel {
  IN_APP
  EMAIL
  SMS
  PUSH
}

enum NotificationType {
  ANNOUNCEMENT
  RESULT_PUBLISHED
  EXAM_SCHEDULED
  PAYMENT_DUE
  ATTENDANCE_ALERT
  MESSAGE
  SYSTEM
}

enum VerificationStatus {
  PENDING
  VERIFIED
  FAILED
}

enum SessionTerminal {
  FIRST
  SECOND
  THIRD
}

// ===========================================
// CORE USER MODEL
// ===========================================

model User {
  id                String    @id @default(cuid())
  email             String    @unique
  phone             String?   @unique
  password          String
  firstName         String
  lastName          String
  middleName        String?
  avatar            String?   // URL to profile picture
  role              UserRole  @default(STUDENT)
  gender            Gender?
  dateOfBirth       DateTime?
  address           String?
  state             String?   // Nigerian state
  lga               String?   // Local Government Area
  nin               String?   // National Identification Number (encrypted)
  bvn               String?   // Bank Verification Number (encrypted)

  isEmailVerified   Boolean   @default(false)
  isPhoneVerified   Boolean   @default(false)
  isActive          Boolean   @default(true)
  isSuspended       Boolean   @default(false)
  suspendedAt       DateTime?
  suspendedReason   String?

  lastLoginAt       DateTime?
  lastLoginIp       String?

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime? // Soft delete

  // Relations
  school            School?   @relation("SchoolAdmin", fields: [managedSchoolId], references: [id])
  managedSchoolId   String?   @unique // For SCHOOL_ADMIN role

  teacherProfile    Teacher?
  studentProfile    Student?
  parentProfile     Parent?

  deviceSession     DeviceSession?
  otpCodes          OtpCode[]
  notifications     Notification[]
  sentMessages      Message[]       @relation("MessageSender")
  auditLogs         AuditLog[]

  @@index([email])
  @@index([phone])
  @@index([role])
  @@map("users")
}

// ===========================================
// SCHOOL
// ===========================================

model School {
  id              String     @id @default(cuid())
  name            String
  code            String     @unique // e.g., "EDU-LAG-001"
  type            SchoolType
  address         String
  city            String
  state           String
  lga             String
  phone           String
  email           String
  website         String?
  logo            String?    // URL
  motto           String?

  // Registration
  rcNumber        String?    // Corporate Affairs Commission number
  isVerified      Boolean    @default(false)
  isActive        Boolean    @default(true)

  // Subscription
  subscriptionPlan   String  @default("FREE") // FREE, BASIC, PRO, ENTERPRISE
  subscriptionExpiry DateTime?

  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  deletedAt       DateTime?

  // Relations
  admin           User?      @relation("SchoolAdmin")
  teachers        Teacher[]
  students        Student[]
  parents         Parent[]
  classrooms      Classroom[]
  subjects        Subject[]
  academicSessions AcademicSession[]
  exams           Exam[]
  invoices        Invoice[]
  announcements   Announcement[]
  settings        SchoolSettings?

  @@index([code])
  @@index([state])
  @@map("schools")
}

model SchoolSettings {
  id                    String  @id @default(cuid())
  school                School  @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  schoolId              String  @unique

  // Grading system
  gradingSystem         Json    @default("{}")  // { A: {min: 70, max: 100}, B: {...} }

  // Term dates
  allowParentPortal     Boolean @default(true)
  allowStudentPortal    Boolean @default(true)

  // Notification preferences
  smsEnabled            Boolean @default(false)
  emailEnabled          Boolean @default(true)

  // CBT settings
  cbtDurationDefault    Int     @default(60)   // minutes
  cbtMaxAttempts        Int     @default(1)
  shuffleQuestions      Boolean @default(true)

  updatedAt             DateTime @updatedAt

  @@map("school_settings")
}

// ===========================================
// ACADEMIC SESSION & TERM
// ===========================================

model AcademicSession {
  id        String          @id @default(cuid())
  name      String          // e.g., "2024/2025"
  startDate DateTime
  endDate   DateTime
  isCurrent Boolean         @default(false)

  school    School          @relation(fields: [schoolId], references: [id])
  schoolId  String

  terms     Term[]

  createdAt DateTime        @default(now())

  @@unique([schoolId, name])
  @@index([schoolId, isCurrent])
  @@map("academic_sessions")
}

model Term {
  id              String          @id @default(cuid())
  terminal        SessionTerminal
  startDate       DateTime
  endDate         DateTime
  isCurrent       Boolean         @default(false)

  session         AcademicSession @relation(fields: [sessionId], references: [id])
  sessionId       String

  exams           Exam[]
  attendances     Attendance[]
  results         Result[]

  @@unique([sessionId, terminal])
  @@map("terms")
}

// ===========================================
// CLASSROOM
// ===========================================

model Classroom {
  id          String    @id @default(cuid())
  name        String    // e.g., "JSS 1A", "Primary 3B"
  level       String    // e.g., "JSS1", "PRIMARY3"
  capacity    Int       @default(40)

  school      School    @relation(fields: [schoolId], references: [id])
  schoolId    String

  formTeacher Teacher?  @relation("ClassroomFormTeacher", fields: [formTeacherId], references: [id])
  formTeacherId String? @unique

  students    Student[]
  subjects    ClassroomSubject[]

  createdAt   DateTime  @default(now())

  @@unique([schoolId, name])
  @@index([schoolId])
  @@map("classrooms")
}

// ===========================================
// TEACHER PROFILE
// ===========================================

model Teacher {
  id              String    @id @default(cuid())
  staffId         String    // e.g., "TCH-2024-001"
  employeeDate    DateTime
  qualification   String?
  specialization  String?

  user            User      @relation(fields: [userId], references: [id])
  userId          String    @unique

  school          School    @relation(fields: [schoolId], references: [id])
  schoolId        String

  // The classroom this teacher is the form teacher of
  formClassroom   Classroom? @relation("ClassroomFormTeacher")

  // Subjects this teacher teaches
  subjectAssignments ClassroomSubject[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([schoolId, staffId])
  @@index([schoolId])
  @@map("teachers")
}

// ===========================================
// STUDENT PROFILE
// ===========================================

model Student {
  id              String    @id @default(cuid())
  admissionNumber String    // e.g., "STU-2024-001"
  admissionDate   DateTime

  // Enrollment
  classroom       Classroom @relation(fields: [classroomId], references: [id])
  classroomId     String

  user            User      @relation(fields: [userId], references: [id])
  userId          String    @unique

  school          School    @relation(fields: [schoolId], references: [id])
  schoolId        String

  // Family
  parent          Parent?   @relation(fields: [parentId], references: [id])
  parentId        String?

  // Records
  results         Result[]
  attendances     Attendance[]
  examAttempts    ExamAttempt[]
  invoices        Invoice[]

  isActive        Boolean   @default(true)
  graduatedAt     DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([schoolId, admissionNumber])
  @@index([schoolId])
  @@index([classroomId])
  @@map("students")
}

// ===========================================
// PARENT PROFILE
// ===========================================

model Parent {
  id          String    @id @default(cuid())
  occupation  String?
  relationship String   @default("Parent") // Mother, Father, Guardian

  user        User      @relation(fields: [userId], references: [id])
  userId      String    @unique

  school      School    @relation(fields: [schoolId], references: [id])
  schoolId    String

  children    Student[]

  createdAt   DateTime  @default(now())

  @@index([schoolId])
  @@map("parents")
}

// ===========================================
// SUBJECT
// ===========================================

model Subject {
  id          String    @id @default(cuid())
  name        String    // e.g., "Mathematics"
  code        String    // e.g., "MTH"
  description String?

  school      School    @relation(fields: [schoolId], references: [id])
  schoolId    String

  classrooms  ClassroomSubject[]
  exams       Exam[]
  results     Result[]

  @@unique([schoolId, code])
  @@index([schoolId])
  @@map("subjects")
}

// Many-to-Many: Classroom ↔ Subject (with Teacher assignment)
model ClassroomSubject {
  id          String    @id @default(cuid())

  classroom   Classroom @relation(fields: [classroomId], references: [id])
  classroomId String

  subject     Subject   @relation(fields: [subjectId], references: [id])
  subjectId   String

  teacher     Teacher   @relation(fields: [teacherId], references: [id])
  teacherId   String

  @@unique([classroomId, subjectId])
  @@map("classroom_subjects")
}

// ===========================================
// EXAM & CBT
// ===========================================

model Exam {
  id              String      @id @default(cuid())
  title           String
  description     String?
  type            ExamType    @default(CBT)
  status          ExamStatus  @default(DRAFT)

  // Timing
  scheduledAt     DateTime?
  durationMinutes Int         @default(60)

  // Scoring
  totalMarks      Int         @default(100)
  passMark        Int         @default(40)

  // CBT Settings
  shuffleQuestions Boolean    @default(true)
  showResultAfter  Boolean    @default(false) // Show result immediately after

  school          School      @relation(fields: [schoolId], references: [id])
  schoolId        String

  subject         Subject     @relation(fields: [subjectId], references: [id])
  subjectId       String

  term            Term        @relation(fields: [termId], references: [id])
  termId          String

  questions       Question[]
  attempts        ExamAttempt[]
  results         Result[]

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([schoolId, status])
  @@index([termId])
  @@map("exams")
}

model Question {
  id            String       @id @default(cuid())
  text          String       // Question text
  type          QuestionType @default(MULTIPLE_CHOICE)
  marks         Int          @default(1)
  explanation   String?      // Shown after exam
  imageUrl      String?      // For questions with images

  // For multiple choice
  options       Json?        // [{ label: "A", text: "...", isCorrect: false }]

  // For short answer / essay
  sampleAnswer  String?

  exam          Exam         @relation(fields: [examId], references: [id], onDelete: Cascade)
  examId        String

  answers       ExamAnswer[]

  @@index([examId])
  @@map("questions")
}

model ExamAttempt {
  id          String    @id @default(cuid())
  startedAt   DateTime  @default(now())
  submittedAt DateTime?
  score       Float?
  isPassed    Boolean?
  timeSpent   Int?      // seconds

  student     Student   @relation(fields: [studentId], references: [id])
  studentId   String

  exam        Exam      @relation(fields: [examId], references: [id])
  examId      String

  answers     ExamAnswer[]

  @@unique([studentId, examId]) // One attempt per student per exam
  @@map("exam_attempts")
}

model ExamAnswer {
  id            String      @id @default(cuid())
  selectedOption String?    // e.g., "A", "B", "C", "D"
  textAnswer    String?     // For essay/short answer
  isCorrect     Boolean?
  marksAwarded  Float       @default(0)

  attempt       ExamAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  attemptId     String

  question      Question    @relation(fields: [questionId], references: [id])
  questionId    String

  @@unique([attemptId, questionId])
  @@map("exam_answers")
}

// ===========================================
// RESULTS
// ===========================================

model Result {
  id              String    @id @default(cuid())

  // Scores
  continuousAssessment Float @default(0)  // CA score (max 40)
  examScore           Float  @default(0)  // Exam score (max 60)
  totalScore          Float  @default(0)  // CA + Exam
  grade               String?             // A, B, C...
  gradePoint          Float?              // 5.0 scale
  remarks             String?
  teacherComment      String?

  student     Student   @relation(fields: [studentId], references: [id])
  studentId   String

  subject     Subject   @relation(fields: [subjectId], references: [id])
  subjectId   String

  term        Term      @relation(fields: [termId], references: [id])
  termId      String

  exam        Exam?     @relation(fields: [examId], references: [id])
  examId      String?

  isPublished Boolean   @default(false)
  publishedAt DateTime?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([studentId, subjectId, termId])
  @@index([studentId, termId])
  @@map("results")
}

// ===========================================
// ATTENDANCE
// ===========================================

model Attendance {
  id          String            @id @default(cuid())
  date        DateTime
  status      AttendanceStatus  @default(PRESENT)
  remark      String?

  student     Student           @relation(fields: [studentId], references: [id])
  studentId   String

  term        Term              @relation(fields: [termId], references: [id])
  termId      String

  markedAt    DateTime          @default(now())

  @@unique([studentId, date])
  @@index([studentId, termId])
  @@map("attendances")
}

// ===========================================
// MESSAGING
// ===========================================

model Message {
  id          String    @id @default(cuid())
  subject     String?
  body        String
  isRead      Boolean   @default(false)
  readAt      DateTime?

  sender      User      @relation("MessageSender", fields: [senderId], references: [id])
  senderId    String

  // Can be sent to a user or a thread
  threadId    String?
  thread      MessageThread? @relation(fields: [threadId], references: [id])

  attachments String[]  // Array of URLs

  createdAt   DateTime  @default(now())

  @@index([senderId])
  @@index([threadId])
  @@map("messages")
}

model MessageThread {
  id          String    @id @default(cuid())
  title       String?
  messages    Message[]
  participants String[] // Array of User IDs

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("message_threads")
}

// ===========================================
// NOTIFICATION
// ===========================================

model Notification {
  id          String              @id @default(cuid())
  title       String
  body        String
  type        NotificationType
  channel     NotificationChannel @default(IN_APP)
  isRead      Boolean             @default(false)
  readAt      DateTime?
  metadata    Json?               // Extra context data

  user        User                @relation(fields: [userId], references: [id])
  userId      String

  createdAt   DateTime            @default(now())

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@map("notifications")
}

model Announcement {
  id          String    @id @default(cuid())
  title       String
  content     String
  targetRoles UserRole[] // Who can see this
  isPinned    Boolean   @default(false)
  expiresAt   DateTime?

  school      School    @relation(fields: [schoolId], references: [id])
  schoolId    String

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([schoolId])
  @@map("announcements")
}

// ===========================================
// BILLING & INVOICES
// ===========================================

model Invoice {
  id              String        @id @default(cuid())
  invoiceNumber   String        @unique // INV-2024-00001
  title           String        // "First Term School Fees 2024/2025"
  description     String?
  amount          Decimal       @db.Decimal(10, 2)
  paidAmount      Decimal       @default(0) @db.Decimal(10, 2)
  dueDate         DateTime
  status          InvoiceStatus @default(PENDING)

  student         Student       @relation(fields: [studentId], references: [id])
  studentId       String

  school          School        @relation(fields: [schoolId], references: [id])
  schoolId        String

  payments        Payment[]

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([schoolId, status])
  @@index([studentId])
  @@map("invoices")
}

model Payment {
  id              String    @id @default(cuid())
  amount          Decimal   @db.Decimal(10, 2)
  reference       String    @unique // Paystack/Flutterwave reference
  channel         String    // "paystack", "flutterwave", "bank_transfer"
  status          String    // "success", "failed", "pending"
  metadata        Json?     // Payment gateway response

  invoice         Invoice   @relation(fields: [invoiceId], references: [id])
  invoiceId       String

  paidAt          DateTime  @default(now())

  @@map("payments")
}

// ===========================================
// SECURITY
// ===========================================

model DeviceSession {
  id            String    @id @default(cuid())
  deviceId      String    // UUID generated on device
  deviceName    String?   // "iPhone 15", "Chrome on Windows"
  deviceType    String?   // "mobile", "desktop", "tablet"
  ipAddress     String?
  userAgent     String?

  refreshToken  String    @unique
  expiresAt     DateTime
  isActive      Boolean   @default(true)

  user          User      @relation(fields: [userId], references: [id])
  userId        String    @unique // ONE device per user

  lastSeenAt    DateTime  @default(now())
  createdAt     DateTime  @default(now())

  @@index([userId])
  @@map("device_sessions")
}

model OtpCode {
  id          String    @id @default(cuid())
  code        String    // 6-digit OTP
  purpose     String    // "EMAIL_VERIFY", "PHONE_VERIFY", "PASSWORD_RESET", "LOGIN"
  expiresAt   DateTime
  usedAt      DateTime?
  attempts    Int       @default(0)

  user        User      @relation(fields: [userId], references: [id])
  userId      String

  createdAt   DateTime  @default(now())

  @@index([userId, purpose])
  @@map("otp_codes")
}

// ===========================================
// AUDIT LOG
// ===========================================

model AuditLog {
  id          String    @id @default(cuid())
  action      String    // "USER_CREATED", "EXAM_PUBLISHED", "RESULT_UPDATED"
  entity      String    // "User", "Exam", "Result"
  entityId    String
  oldValue    Json?     // Before change
  newValue    Json?     // After change
  ipAddress   String?
  userAgent   String?

  user        User?     @relation(fields: [userId], references: [id])
  userId      String?

  createdAt   DateTime  @default(now())

  @@index([entity, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}

// ===========================================
// PERMISSIONS (Fine-grained RBAC)
// ===========================================

model Permission {
  id          String    @id @default(cuid())
  name        String    @unique // "students:read", "exams:create"
  description String?
  resource    String    // "students", "exams"
  action      String    // "read", "create", "update", "delete"

  rolePermissions RolePermission[]

  @@unique([resource, action])
  @@map("permissions")
}

model RolePermission {
  id            String      @id @default(cuid())
  role          UserRole

  permission    Permission  @relation(fields: [permissionId], references: [id])
  permissionId  String

  @@unique([role, permissionId])
  @@map("role_permissions")
}
```

---

## ⚙️ Setting Up Prisma Service in NestJS

```typescript
// apps/api/src/database/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["error"],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Soft delete helper - marks deletedAt instead of deleting
  async softDelete(model: string, id: string) {
    return (this as any)[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
```

```typescript
// apps/api/src/database/prisma/prisma.module.ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global() // Makes PrismaService available everywhere without importing
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

---

## 🌱 Database Seeding

```typescript
// apps/api/prisma/seed.ts
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create Super Admin
  const superAdminPassword = await bcrypt.hash("SuperAdmin@123", 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@edusaas.ng" },
    update: {},
    create: {
      email: "superadmin@edusaas.ng",
      password: superAdminPassword,
      firstName: "Super",
      lastName: "Admin",
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
    },
  });
  console.log(`✅ Super Admin created: ${superAdmin.email}`);

  // 2. Create a Demo School
  const demoSchool = await prisma.school.upsert({
    where: { code: "EDU-LAG-001" },
    update: {},
    create: {
      name: "EduSaas Demo Academy",
      code: "EDU-LAG-001",
      type: "NURSERY_PRIMARY_SECONDARY",
      address: "12 Education Lane, Victoria Island",
      city: "Lagos",
      state: "Lagos",
      lga: "Eti-Osa",
      phone: "+2348012345678",
      email: "info@demodemy.edu.ng",
      isVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ Demo School created: ${demoSchool.name}`);

  // 3. Create School Admin
  const adminPassword = await bcrypt.hash("SchoolAdmin@123", 12);
  const schoolAdmin = await prisma.user.upsert({
    where: { email: "admin@demodemy.edu.ng" },
    update: {},
    create: {
      email: "admin@demodemy.edu.ng",
      password: adminPassword,
      firstName: "Chidi",
      lastName: "Okonkwo",
      role: UserRole.SCHOOL_ADMIN,
      isEmailVerified: true,
      managedSchoolId: demoSchool.id,
    },
  });
  console.log(`✅ School Admin created: ${schoolAdmin.email}`);

  // 4. Seed permissions
  const permissions = [
    { resource: "students", action: "read" },
    { resource: "students", action: "create" },
    { resource: "students", action: "update" },
    { resource: "students", action: "delete" },
    { resource: "exams", action: "read" },
    { resource: "exams", action: "create" },
    { resource: "exams", action: "publish" },
    { resource: "results", action: "read" },
    { resource: "results", action: "publish" },
    { resource: "attendance", action: "mark" },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: { resource: perm.resource, action: perm.action },
      },
      update: {},
      create: {
        name: `${perm.resource}:${perm.action}`,
        resource: perm.resource,
        action: perm.action,
      },
    });
  }
  console.log(`✅ Permissions seeded`);

  console.log("\n🎉 Seeding complete!");
  console.log("📋 Login credentials:");
  console.log("   Super Admin: superadmin@edusaas.ng / SuperAdmin@123");
  console.log("   School Admin: admin@demodemy.edu.ng / SchoolAdmin@123");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```json
// Add to apps/api/package.json scripts
{
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "ts-node prisma/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset"
  }
}
```

---

## 🔍 Prisma Query Patterns

### Basic Queries

```typescript
// Find one user
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    firstName: true,
    // password excluded! Never return passwords
  },
});

// Find many with filters
const students = await prisma.student.findMany({
  where: {
    schoolId,
    isActive: true,
    classroom: {
      level: "JSS1",
    },
  },
  include: {
    user: {
      select: { firstName: true, lastName: true, avatar: true },
    },
    classroom: true,
    parent: {
      include: { user: { select: { phone: true } } },
    },
  },
  orderBy: { createdAt: "desc" },
  skip: (page - 1) * limit,
  take: limit,
});

// Count for pagination
const total = await prisma.student.count({
  where: { schoolId, isActive: true },
});
```

### Transactions

```typescript
// Example: Enroll student (creates user + student profile atomically)
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: "STUDENT",
    },
  });

  const student = await tx.student.create({
    data: {
      userId: user.id,
      schoolId,
      classroomId,
      admissionNumber: await generateAdmissionNumber(schoolId),
      admissionDate: new Date(),
    },
  });

  return { user, student };
});
```

💡 **WHY transactions?**: If user creation succeeds but student creation fails, you'd have a "ghost" user with no profile. A transaction ensures BOTH succeed or BOTH fail. This is **ACID compliance** — critical for financial and academic data.

---

## 🗄️ Run Migrations

```bash
cd apps/api

# Initialize Prisma (first time)
npx prisma init

# After writing schema, run first migration
npx prisma migrate dev --name init

# Seed the database
pnpm db:seed

# Open Prisma Studio (visual database browser)
npx prisma studio
```

---

## 📝 Day 2 Checklist

- [ ] Full Prisma schema written
- [ ] First migration run successfully
- [ ] PrismaService created in NestJS
- [ ] PrismaModule set as Global module
- [ ] Seed file created and run
- [ ] Database visible in Prisma Studio
- [ ] Understand soft deletes, transactions, relations

---

_Next: Day 3 — NestJS Bootstrap, Main Config, and Full Auth System_
