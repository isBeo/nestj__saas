export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  SCHOOL_ADMIN = "SCHOOL_ADMIN",
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
  PARENT = "PARENT",
}
export interface UserPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  schoolId?: string;
}
