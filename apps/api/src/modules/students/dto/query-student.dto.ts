import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryStudentDto {
  @ApiProperty({
    required: false,
    description: 'Search by name or admission number',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  classroomId?: string;

  @ApiProperty({ required: false, enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
