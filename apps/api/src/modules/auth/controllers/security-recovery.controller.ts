// apps/api/src/modules/auth/controllers/security-recovery.controller.ts
import {
  Controller,
  Post,
  Body,
  Ip,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { IsString, IsEmail, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SecurityRecoveryService } from '../services/security-recovery.service';
import { Public } from '../../../common/decorators/public.decorator';

class SecurityRecoveryDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'new-device-uuid' })
  @IsString()
  deviceId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({ example: '12345678901', required: false })
  @IsOptional()
  @IsString()
  nin?: string;

  @ApiProperty({ example: '12345678901', required: false })
  @IsOptional()
  @IsString()
  bvn?: string;

  @ApiProperty({ example: 'Chidi' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Okonkwo' })
  @IsString()
  lastName: string;
}

@ApiTags('Auth')
@Controller({ path: 'auth/security-recovery', version: '1' })
export class SecurityRecoveryController {
  constructor(private recoveryService: SecurityRecoveryService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recover account from device conflict using NIN/BVN',
    description: `
      When a user tries to login from a new device but the account is active
      on another device, they must verify their identity using NIN or BVN.
      
      On success: old session is terminated, new device is allowed to login.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Identity verified, old session terminated',
  })
  @ApiResponse({ status: 401, description: 'Identity verification failed' })
  @ApiResponse({ status: 403, description: 'Too many attempts' })
  async initiateRecovery(
    @Body() dto: SecurityRecoveryDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.recoveryService.initiateRecovery(dto, ip, userAgent);
  }
}
