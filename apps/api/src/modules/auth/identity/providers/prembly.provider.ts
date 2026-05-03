// apps/api/src/modules/auth/identity/providers/prembly.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from '../identity-verification.interface';
import { env } from '../../../../config/env.config';

@Injectable()
export class PremblyProvider implements IIdentityVerificationProvider {
  private readonly logger = new Logger(PremblyProvider.name);
  private readonly BASE_URL =
    'https://api.prembly.com/identitypass/verification';

  getName(): string {
    return 'prembly';
  }

  async verifyNin(request: VerificationRequest): Promise<VerificationResult> {
    try {
      const response = await fetch(`${this.BASE_URL}/nin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.PREMBLY_API_KEY ?? '',
          'app-id': env.PREMBLY_APP_ID ?? '',
        },
        body: JSON.stringify({
          number: request.nin,
          firstname: request.firstName,
          lastname: request.lastName,
        }),
      });

      const data: unknown = await response.json();
      const ninData = this.getRecordField(data, 'nin_data');

      // Prembly returns status and verification object
      if (this.isSuccess(data) && ninData) {
        const nameMatch = this.checkNameMatch(
          request.firstName,
          request.lastName,
          this.asString(ninData.firstname),
          this.asString(ninData.lastname),
        );

        return {
          isVerified: nameMatch.score > 70,
          confidence: nameMatch.score,
          provider: this.getName(),
          rawResponse: data,
        };
      }

      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason:
          this.asString(this.getField(data, 'detail')) ||
          'NIN verification failed',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error('Prembly NIN verification error', error);
      throw error;
    }
  }

  async verifyBvn(request: VerificationRequest): Promise<VerificationResult> {
    try {
      const response = await fetch(`${this.BASE_URL}/bvn/basic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.PREMBLY_API_KEY ?? '',
          'app-id': env.PREMBLY_APP_ID ?? '',
        },
        body: JSON.stringify({
          number: request.bvn,
          firstname: request.firstName,
          lastname: request.lastName,
        }),
      });

      const data: unknown = await response.json();
      const bvnData = this.getRecordField(data, 'bvn_data');

      if (this.isSuccess(data) && bvnData) {
        const nameMatch = this.checkNameMatch(
          request.firstName,
          request.lastName,
          this.asString(bvnData.firstName),
          this.asString(bvnData.lastName),
        );

        return {
          isVerified: nameMatch.score > 70,
          confidence: nameMatch.score,
          provider: this.getName(),
          rawResponse: data,
        };
      }

      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason: 'BVN verification failed',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error('Prembly BVN verification error', error);
      throw error;
    }
  }

  // Fuzzy name matching — handles Chidi vs CHIDI, etc.
  private checkNameMatch(
    inFirst: string,
    inLast: string,
    dbFirst: string,
    dbLast: string,
  ): { score: number } {
    const normalize = (s: string) => s.toLowerCase().trim();

    const firstMatch = normalize(inFirst) === normalize(dbFirst) ? 50 : 0;
    const lastMatch = normalize(inLast) === normalize(dbLast) ? 50 : 0;

    return { score: firstMatch + lastMatch };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isSuccess(value: unknown): boolean {
    return this.isRecord(value) && value.status === true;
  }

  private getRecordField(
    value: unknown,
    key: 'nin_data' | 'bvn_data',
  ): Record<string, unknown> | undefined {
    if (!this.isRecord(value)) return undefined;
    const field = value[key];
    return this.isRecord(field) ? field : undefined;
  }

  private getField(value: unknown, key: string): unknown {
    if (!this.isRecord(value)) return undefined;
    return value[key];
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
