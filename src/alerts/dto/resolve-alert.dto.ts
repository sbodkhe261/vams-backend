import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveAlertDto {
  @ApiProperty({ example: 'Replaced hydraulic seal and bleed brakes.', description: 'Resolution action reason' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ example: 'Testing shows zero leaks under operating pressure.', required: false, description: 'Optional resolution notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'uploads/company_b/resolutions/res_cfa3410c.wav', required: false, description: 'Path to audio explanation file' })
  @IsString()
  @IsOptional()
  audioPath?: string;

  @ApiProperty({ example: 'Brake oil leak repaired and tested.', required: false, description: 'Speech-to-text transcription of audio explanation' })
  @IsString()
  @IsOptional()
  transcription?: string;

  @ApiProperty({
    type: [String],
    example: [
      'https://s3.vams-platform.com/uploads/company_b/images/seal_repair_before.png',
      'https://s3.vams-platform.com/uploads/company_b/images/seal_repair_after.png'
    ],
    required: false,
    description: 'URLs of resolution images uploaded'
  })
  @IsArray()
  @IsOptional()
  imageUrls?: string[];
}
