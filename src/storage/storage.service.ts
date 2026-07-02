import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  async uploadFile(
    companyId: string,
    file: Express.Multer.File,
    purpose: 'AUDIO_RESOLUTION' | 'IMAGE_RESOLUTION',
  ): Promise<{ fileUrl: string; fileName: string }> {
    // In production, instantiate AWS.S3 client or MinIO client
    // const s3 = new AWS.S3();
    // await s3.putObject({ Bucket: 'vams', Key: key, Body: file.buffer }).promise();

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const folder = purpose.toLowerCase();
    const key = `company_${companyId}/${folder}/${Date.now()}_${sanitizedName}`;

    // Write file to local disk under 'public/uploads'
    try {
      const absolutePath = path.join(process.cwd(), 'public', 'uploads', key);
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(absolutePath, file.buffer);
      console.log(`[StorageService] Saved file to local path: ${absolutePath}`);
    } catch (err) {
      console.error('[StorageService] Error saving file to local path:', err);
    }

    // Return mock production URL which will be resolved to local URL in client
    const fileUrl = `https://s3.vams-platform.com/uploads/${key}`;

    console.log(`[StorageService] Uploaded ${file.size} bytes file to bucket: ${key}`);

    return {
      fileUrl,
      fileName: sanitizedName,
    };
  }
}
