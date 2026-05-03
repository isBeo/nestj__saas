// apps/api/src/modules/auth/identity/identity-verification.service.ts
// The orchestrator — picks provider, handles fallback
import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IIdentityVerificationProvider,
  VerificationRequest,
  VerificationResult,
} from './identity-verification.interface';
import { PremblyProvider } from './providers/prembly.provider';
import { DojahProvider } from './providers/dojah.provider';

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  // Ordered list of providers — primary first, fallbacks after
  private providers: IIdentityVerificationProvider[];

  constructor(
    private prembly: PremblyProvider,
    private dojah: DojahProvider,
  ) {
    this.providers = [prembly, dojah]; // Prembly is primary
  }

  async verifyIdentity(
    request: VerificationRequest,
  ): Promise<VerificationResult> {
    if (!request.nin && !request.bvn) {
      throw new BadRequestException(
        'Either NIN or BVN is required for verification',
      );
    }

    // Try each provider in order — if one fails, try the next
    for (const provider of this.providers) {
      try {
        this.logger.log(
          `Attempting identity verification via ${provider.getName()}`,
        );

        let result: VerificationResult;

        if (request.nin) {
          result = await provider.verifyNin(request);
        } else {
          result = await provider.verifyBvn(request);
        }

        if (result.isVerified || result.confidence > 0) {
          // Got a meaningful response from this provider
          this.logger.log(
            `Verification via ${provider.getName()}: ${result.isVerified} (${result.confidence}%)`,
          );
          return result;
        }
      } catch (error) {
        this.logger.warn(
          `Provider ${provider.getName()} failed: ${error.message}. Trying next...`,
        );
        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    throw new ServiceUnavailableException(
      'Identity verification service is temporarily unavailable. Please try again later.',
    );
  }
}
