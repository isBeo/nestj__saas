export interface School {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  subscriptionPlan?: "FREE" | "BASIC" | "PREMIUM";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchoolPayload {
  schoolId: string;
}
