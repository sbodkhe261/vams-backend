import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertStatus, UserRole, Severity, NotificationChannel } from '@prisma/client';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

  /**
   * Periodically check for overdue alerts and trigger escalation workflows.
   * Can be invoked by a cron scheduler task in main app module.
   */
  async processEscalations() {
    const now = new Date();

    // Query active alerts requiring immediate escalation
    const overdueAlerts = await this.prisma.alert.findMany({
      where: {
        status: { not: AlertStatus.RESOLVED },
        nextEscalationAt: { lte: now },
      },
      include: {
        defect: true,
      },
    });

    if (overdueAlerts.length === 0) {
      return;
    }

    this.logger.log(`Found ${overdueAlerts.length} overdue alerts. Processing escalations...`);

    for (const alert of overdueAlerts) {
      try {
        await this.escalateAlert(alert);
      } catch (err) {
        this.logger.error(`Failed to escalate alert ${alert.id}:`, err.stack);
      }
    }
  }

  private async escalateAlert(alert: any) {
    const nextStep = alert.escalationStep + 1;
    const currentRole = alert.assignedToRole;

    // Define standard SLA escalation target hierarchy mapping Play rules
    let nextRole: UserRole = UserRole.SUPERVISOR;
    let incrementMin = 60; // default next check in 60 mins

    if (currentRole === UserRole.WORKER || currentRole === UserRole.QUALITY_INSPECTOR) {
      nextRole = UserRole.SUPERVISOR;
      incrementMin = alert.severity === Severity.CRITICAL ? 60 : 180; // faster checks for criticals
    } else if (currentRole === UserRole.SUPERVISOR) {
      nextRole = UserRole.FACTORY_MANAGER;
      incrementMin = 360; // 6 hours
    } else if (currentRole === UserRole.FACTORY_MANAGER) {
      nextRole = UserRole.COMPANY_ADMIN;
      incrementMin = 1440; // 24 hours
    } else {
      nextRole = UserRole.SUPER_ADMIN;
      incrementMin = 2880; // 48 hours
    }

    const nextEscalationAt = new Date(Date.now() + incrementMin * 60 * 1000);

    // Apply database-configured overrides if present
    const overrideRule = await this.prisma.escalationRule.findFirst({
      where: {
        companyId: alert.companyId,
        severity: alert.severity,
        escalateToRole: nextRole,
        isActive: true,
      },
    });

    if (overrideRule) {
      incrementMin = overrideRule.escalateAfterDays * 24 * 60;
    }

    await this.prisma.$transaction(async (tx) => {
      // Update Alert Step
      await tx.alert.update({
        where: { id: alert.id },
        data: {
          assignedToRole: nextRole,
          assignedToUserId: null, // Reset specific assignee on escalation to role pool
          escalationStep: nextStep,
          nextEscalationAt,
        },
      });

      // Record in Escalation History
      await tx.escalationHistory.create({
        data: {
          alertId: alert.id,
          steppedFromRole: currentRole,
          steppedToRole: nextRole,
          notes: `Escalated due to response SLA timeout (${incrementMin} mins).`,
        },
      });

      // Log in audit timeline
      await tx.defectResolutionTimeline.create({
        data: {
          alertId: alert.id,
          actionType: 'ESCALATED',
          details: `SYSTEM ESCALATION: Overdue. Escalated assignment from ${currentRole} to ${nextRole}.`,
        },
      });
    });

    // Notify Real-Time room dashboard (Supervisors/Managers)
    this.realtime.broadcastToCompany(alert.companyId, 'ALERT_ESCALATED', {
      alertId: alert.id,
      steppedFromRole: currentRole,
      steppedToRole: nextRole,
    });

    // Send push notification to target role members
    const targetMembers = await this.prisma.user.findMany({
      where: { companyId: alert.companyId, role: nextRole, isActive: true },
    });

    for (const member of targetMembers) {
      await this.notifications.enqueueNotification({
        companyId: alert.companyId,
        userId: member.id,
        alertId: alert.id,
        title: `ESCALATED ALERT: ${alert.defect.name}`,
        message: `Overdue alert for VIN ${alert.vin} escalated to your role: ${nextRole}`,
        channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL, NotificationChannel.IN_APP],
      });
    }
  }
}
