// apps/api/src/modules/auth/identity/identity-verification.interface.ts

export interface VerificationRequest {
  nin?: string; // National Identification Number
  bvn?: string; // Bank Verification Number
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // ISO date string
  phoneNumber?: string;
}

export interface VerificationResult {
  isVerified: boolean;
  confidence: number; // 0-100 score
  provider: string; // Which provider responded
  rawResponse?: any; // For debugging
  failureReason?: string;
}

// The contract every identity provider must implement
export interface IIdentityVerificationProvider {
  verifyNin(request: VerificationRequest): Promise<VerificationResult>;
  verifyBvn(request: VerificationRequest): Promise<VerificationResult>;
  getName(): string;
}
