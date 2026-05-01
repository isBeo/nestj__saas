// apps/api/src/modules/auth/dto/register.dto.ts
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsOptional()
  @Matches(/^\+234[0-9]{10}$/, {
    message: 'Phone must be a valid Nigerian number (+234XXXXXXXXXX)',
  })
  phone?: string;

  @ApiProperty({ example: 'SecurePass@123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  password!: string;

  @ApiProperty({ example: 'Chidi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Okonkwo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ example: 'SCHOOL_ADMIN', enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({ example: 'school-id-here', required: false })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
