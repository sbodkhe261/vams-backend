import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';

@Processor('notifications')
@Injectable()
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (getApps().length === 0) {
      const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
      const credPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
      
      try {
        if (fs.existsSync(credPath)) {
          initializeApp({
            credential: cert(credPath),
          });
          console.log(`[Firebase Admin] Successfully initialized with file ${credPath}`);
        } else {
          console.warn(`[Firebase Admin] Service account file not found at ${credPath}. Real push notifications will not be sent.`);
        }
      } catch (err) {
        console.error('[Firebase Admin] Error initializing SDK:', err);
      }
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { notificationId, channel, title, message, userId } = job.data;

    console.log(`[BullMQ Worker] Processing notification ${notificationId} via channel: ${channel}`);

    switch (channel) {
      case NotificationChannel.EMAIL:
        await this.sendMockEmail(title, message);
        break;
      case NotificationChannel.PUSH:
        await this.sendPush(userId, title, message);
        break;
      case NotificationChannel.SMS:
        await this.sendMockSms(title, message);
        break;
      case NotificationChannel.IN_APP:
        // Already logged to DB, client will pull or get via websocket
        break;
    }

    return { status: 'SENT', notificationId };
  }

  private async sendMockEmail(title: string, message: string) {
    // Integrate with nodemailer/AWS SES in production
    console.log(`Sending Email: "${title}" - "${message}"`);
  }

  private async sendPush(userId: string, title: string, message: string) {
    if (!userId) {
      console.log(`[FCM Push] No userId provided, skipping push: "${title}"`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (!user || !user.fcmToken) {
      console.log(`[FCM Push] No active device token found for user ${userId}. Push skipped.`);
      return;
    }

    if (getApps().length === 0) {
      console.warn(`[FCM Push] Firebase Admin not initialized. Simulated push: "${title}" - "${message}" to token ${user.fcmToken}`);
      return;
    }

    const payload = {
      notification: {
        title,
        body: message,
      },
      token: user.fcmToken,
    };

    try {
      const response = await getMessaging().send(payload);
      console.log(`[FCM Push] Notification sent successfully to user ${userId}:`, response);
    } catch (error) {
      console.error(`[FCM Push] Error sending push notification to user ${userId}:`, error);
    }
  }

  private async sendMockSms(title: string, message: string) {
    // Integrate with Twilio in production
    console.log(`Sending SMS: "${title}" - "${message}"`);
  }
}
