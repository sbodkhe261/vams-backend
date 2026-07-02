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
    if (getApps().length > 0) {
      return;
    }

    try {
      // 1. Try environment variable (Production / Render)
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

      // 2. Try service account file path (Local development)
      const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
      const credPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

      if (fs.existsSync(credPath)) {
        initializeApp({
          credential: cert(credPath),
        });
        console.log(`[Firebase Admin] Initialized successfully using file: ${credPath}`);
        return;
      }

      console.warn(
        `[Firebase Admin] Firebase config not found. Neither FIREBASE_SERVICE_ACCOUNT env var nor file at ${credPath} exists.`,
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
        await this.sendPush(notificationId, userId, title, message);
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
    notificationId: string,
    userId: string,
    title: string,
    message: string,
  ) {
    if (!userId) {
      console.log('No userId supplied.');
      return;
    }

    let severity = 'INFO';
    let soundProfile = 'ALERT';
    let alertId = '';

    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          alert: {
            include: {
              defect: true,
            },
          },
        },
      });

      if (notification?.alert) {
        alertId = notification.alertId || '';
        severity = notification.alert.severity || 'INFO';
        soundProfile = notification.alert.defect?.soundProfile || 'ALERT';
      }
    } catch (dbErr) {
      console.error('[sendPush] Error querying database for notification metadata:', dbErr);
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
      // Send a high-priority data-only message so that onMessageReceived triggers
      // and plays the custom sound even if the app is in the background or closed.
      const response = await getMessaging().send({
        token: user.fcmToken,
        data: {
          alertId,
          severity,
          soundProfile,
          title,
          message,
        },
        android: {
          priority: 'high',
        },
      });

      console.log('Push notification sent successfully:', response, { alertId, severity, soundProfile });
    } catch (error) {
      console.error('FCM Error:', error);
    }
  }
}