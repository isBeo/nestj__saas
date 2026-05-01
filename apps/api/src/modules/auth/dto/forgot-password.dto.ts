// apps/api/src/modules/auth/dto/forgot-password.dto.ts
import { IsEmail, IsString, MinLength, Matches, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'chidi@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  otp!: string;

  @ApiProperty({ example: 'chidi@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({ example: 'NewSecurePass@123' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message: 'Password too weak',
  })
  newPassword!: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  otp!: string;

  @IsIn(['EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET'])
  purpose!: string;
}
