// apps/api/src/modules/auth/identity/providers/dojah.provider.ts
// A second provider — demonstrates the abstraction power

import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../../../config/env.config';
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from '../identity-verification.interface';

@Injectable()
export class DojahProvider implements IIdentityVerificationProvider {
  private readonly logger = new Logger(DojahProvider.name);
  private readonly BASE_URL = env.DOJAH_BASE_URL ?? 'https://api.dojah.io';

  getName(): string {
    return 'dojah';
  }

  async verifyNin(request: VerificationRequest): Promise<VerificationResult> {
    this.logger.log('Verifying NIN via Dojah');

    if (!request.nin) {
      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason: 'NIN is required',
      };
    }

    this.assertConfigured();

    const url = new URL('/api/v1/kyc/nin', this.BASE_URL);
    url.searchParams.set('nin', request.nin);

    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await this.safeJson(response);

      if (!response.ok) {
        return {
          isVerified: false,
          confidence: 0,
          provider: this.getName(),
          failureReason:
            data?.error ?? `Dojah NIN lookup failed (${response.status})`,
          rawResponse: data,
        };
      }

      const entity = data?.entity;
      if (!entity) {
        return {
          isVerified: false,
          confidence: 0,
          provider: this.getName(),
          failureReason: 'Invalid Dojah response',
          rawResponse: data,
        };
      }

      const entityFirstName =
        typeof entity.first_name === 'string'
          ? (entity.first_name as string)
          : undefined;
      const entityLastName =
        typeof entity.last_name === 'string'
          ? (entity.last_name as string)
          : undefined;

      const nameMatch = this.checkNameMatch(
        request.firstName,
        request.lastName,
        entityFirstName,
        entityLastName,
      );

      return {
        isVerified: nameMatch.score > 70,
        confidence: nameMatch.score,
        provider: this.getName(),
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error('Dojah NIN verification error', error);
      throw error;
    }
  }

  async verifyBvn(request: VerificationRequest): Promise<VerificationResult> {
    this.logger.log('Verifying BVN via Dojah');

    if (!request.bvn) {
      return {
        isVerified: false,
        confidence: 0,
        provider: this.getName(),
        failureReason: 'BVN is required',
      };
    }

    this.assertConfigured();

    const url = new URL('/api/v1/kyc/bvn', this.BASE_URL);
    url.searchParams.set('bvn', request.bvn);
    url.searchParams.set('first_name', request.firstName);
    url.searchParams.set('last_name', request.lastName);
    if (request.dateOfBirth) url.searchParams.set('dob', request.dateOfBirth);

    try {
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await this.safeJson(response);

      if (!response.ok) {
        return {
          isVerified: false,
          confidence: 0,
          provider: this.getName(),
          failureReason:
            data?.error ?? `Dojah BVN validation failed (${response.status})`,
          rawResponse: data,
        };
      }

      const entity = data?.entity;
      const bvnOk = entity?.bvn?.status === true;
      const firstOk = entity?.first_name?.status === true;
      const lastOk = entity?.last_name?.status === true;

      const firstScore =
        typeof entity?.first_name?.confidence_value === 'number'
          ? entity.first_name.confidence_value
          : 0;
      const lastScore =
        typeof entity?.last_name?.confidence_value === 'number'
          ? entity.last_name.confidence_value
          : 0;

      const scores = [firstScore, lastScore].filter((v) => v > 0);
      const confidence =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;

      return {
        isVerified: bvnOk && firstOk && lastOk && confidence > 70,
        confidence,
        provider: this.getName(),
        rawResponse: data,
        failureReason:
          bvnOk && (firstOk || lastOk)
            ? undefined
            : (data?.error ?? 'BVN verification failed'),
      };
    } catch (error) {
      this.logger.error('Dojah BVN verification error', error);
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      AppId: env.DOJAH_APP_ID ?? '',
      Authorization: env.DOJAH_SECRET_KEY ?? '',
    };
  }

  private assertConfigured(): void {
    if (!env.DOJAH_APP_ID || !env.DOJAH_SECRET_KEY) {
      throw new Error('Dojah credentials are not configured');
    }
  }

  private async safeJson(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  private checkNameMatch(
    inFirst: string,
    inLast: string,
    dbFirst?: string,
    dbLast?: string,
  ): { score: number } {
    const normalize = (s: string) => s.toLowerCase().trim();
    if (!dbFirst || !dbLast) return { score: 0 };

    const firstMatch = normalize(inFirst) === normalize(dbFirst) ? 50 : 0;
    const lastMatch = normalize(inLast) === normalize(dbLast) ? 50 : 0;

    return { score: firstMatch + lastMatch };
  }
}
