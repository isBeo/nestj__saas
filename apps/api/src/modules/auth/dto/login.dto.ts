// apps/api/src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({
    example: 'device-uuid-here',
    description: 'Unique device identifier',
  })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({ example: 'Chrome on Windows 11', required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
