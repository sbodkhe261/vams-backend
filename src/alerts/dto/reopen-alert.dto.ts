import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReopenAlertDto {
  @ApiProperty({ example: 'Test fail on assembly line. Leak still present.', description: 'Reason for reopening the alert' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
