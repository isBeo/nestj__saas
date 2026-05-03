import { ApiProperty } from '@nestjs/swagger';
import { SchoolType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSchoolDto {
  @ApiProperty({ example: 'Greenfield Academy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'NURSERY_PRIMARY_SECONDARY', enum: SchoolType })
  @IsEnum(SchoolType)
  type: SchoolType;

  @ApiProperty({ example: '12 Education Lane, GRA' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Port Harcourt' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Rivers' })
  @IsString()
  state: string;

  @ApiProperty({ example: 'Obio-Akpor' })
  @IsString()
  lga: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @Matches(/^\+234[0-9]{10}$/, {
    message: 'Provide a valid Nigerian phone number',
  })
  phone: string;

  @ApiProperty({ example: 'info@greenfield.edu.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, example: 'https://greenfield.edu.ng' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ required: false, example: 'Excellence in Education' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motto?: string;
}
