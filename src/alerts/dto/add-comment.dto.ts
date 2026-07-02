import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({ example: 'Caliper assembly is disassembled. Waiting for seal kit.', description: 'Text content of the comment' })
  @IsString()
  @IsNotEmpty()
  commentText: string;

  @ApiProperty({ example: 'uploads/company_alpha/comments/caliper_check.wav', required: false, description: 'Optional path to audio comment file' })
  @IsString()
  @IsOptional()
  audioPath?: string;

  @ApiProperty({ example: 'Cylinder seal is damaged.', required: false, description: 'Optional speech-to-text transcription of audio comment' })
  @IsString()
  @IsOptional()
  transcription?: string;
}
