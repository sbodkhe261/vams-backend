import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ example: 'soft_bell.wav', required: false, description: 'Sound file for info alerts' })
  @IsString()
  @IsOptional()
  soundInfo?: string;

  @ApiProperty({ example: 'chime.wav', required: false, description: 'Sound file for warning alerts' })
  @IsString()
  @IsOptional()
  soundWarning?: string;

  @ApiProperty({ example: 'alarm.wav', required: false, description: 'Sound file for critical alerts' })
  @IsString()
  @IsOptional()
  soundCritical?: string;

  @ApiProperty({ example: 'siren.wav', required: false, description: 'Sound file for emergency alerts' })
  @IsString()
  @IsOptional()
  soundEmergency?: string;

  @ApiProperty({ example: 1440, required: false, description: 'Escalation grace period in minutes' })
  @IsInt()
  @Min(0)
  @IsOptional()
  escalationGraceMin?: number;
}
