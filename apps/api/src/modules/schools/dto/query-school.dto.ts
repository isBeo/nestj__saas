import { ApiProperty } from '@nestjs/swagger';
import { SchoolType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QuerySchoolDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ required: false, enum: SchoolType })
  @IsOptional()
  @IsEnum(SchoolType)
  type?: SchoolType;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
