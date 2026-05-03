import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class EnrollStudentDto {
  @ApiProperty({ example: 'emeka@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Emeka' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Obi' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'Chukwuemeka', required: false })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ example: 'MALE', enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: '2010-05-15' })
  @IsISO8601()
  dateOfBirth: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @Matches(/^\+234[0-9]{10}$/)
  phone?: string;

  @ApiProperty({ example: 'classroom-id-here' })
  @IsString()
  @IsNotEmpty()
  classroomId: string;

  @ApiProperty({ example: '2024-09-01' })
  @IsISO8601()
  admissionDate: string;

  @ApiProperty({ example: 'parent-id-here', required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
