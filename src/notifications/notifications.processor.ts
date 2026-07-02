import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

@Processor('notifications')
@Injectable()
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (getApps().length > 0) {
      return;
    }

    try {
      // Render Environment Variable
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(
          process.env.FIREBASE_SERVICE_ACCOUNT,
        );

        initializeApp({
          credential: cert(serviceAccount),
        });

        console.log(
          '[Firebase Admin] Initialized successfully using environment variable.',
        );
        return;
      }

      console.warn(
        '[Firebase Admin] FIREBASE_SERVICE_ACCOUNT environment variable not found.',
      );
    } catch (err) {
      console.error('[Firebase Admin] Initialization failed:', err);
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { notificationId, channel, title, message, userId } = job.data;

    console.log(
      `[BullMQ Worker] Processing notification ${notificationId} via ${channel}`,
    );

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
        break;
    }

    return {
      status: 'SENT',
      notificationId,
    };
  }

  private async sendMockEmail(title: string, message: string) {
    console.log(`Sending Email: ${title} - ${message}`);
  }

  private async sendMockSms(title: string, message: string) {
    console.log(`Sending SMS: ${title} - ${message}`);
  }

  private async sendPush(
    userId: string,
    title: string,
    message: string,
  ) {
    if (!userId) {
      console.log('No userId supplied.');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fcmToken: true,
      },
    });

    if (!user?.fcmToken) {
      console.log(`No FCM token found for user ${userId}`);
      return;
    }

    if (getApps().length === 0) {
      console.log('Firebase not initialized.');
      return;
    }

    try {
      const response = await getMessaging().send({
        token: user.fcmToken,
        notification: {
          title,
          body: message,
        },
      });

      console.log('Push notification sent:', response);
    } catch (error) {
      console.error('FCM Error:', error);
    }
  }
}