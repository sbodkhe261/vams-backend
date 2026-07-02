import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Request,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Storage & Multimedia')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Resolution media file (Audio or Image)',
        },
        purpose: {
          type: 'string',
          enum: ['AUDIO_RESOLUTION', 'IMAGE_RESOLUTION'],
          description: 'Purpose of the upload',
        },
      },
      required: ['file', 'purpose'],
    },
  })
  @ApiOperation({ summary: 'Upload resolution media file (Audio or Image)' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('purpose') purpose: 'AUDIO_RESOLUTION' | 'IMAGE_RESOLUTION',
    @Request() req: any,
  ) {
    return this.storageService.uploadFile(req.user.companyId, file, purpose);
  }

  @Get('transcription/:fileId')
  @ApiOperation({ summary: 'Get mock audio transcription by fileId' })
  async getTranscription(@Param('fileId') fileId: string) {
    return {
      fileId,
      status: 'COMPLETED',
      transcription: 'Brake oil leak repaired and tested.',
    };
  }
}
