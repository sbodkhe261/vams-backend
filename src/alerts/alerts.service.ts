import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { Severity, AlertStatus, UserRole, NotificationChannel } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

  /**
   * External Event Ingest (REST Webhook ingestion layer)
   */
  async ingestEvent(payload: {
    source: string;
    event_type: string;
    companyId: string;
    vin: string;
    defectName: string;
  }) {
    console.log('[DEBUG Ingest] Incoming Payload:', payload);
    // 1. Validate company exists
    const company = await this.prisma.company.findUnique({
      where: { id: payload.companyId },
    });
    if (!company) {
      throw new NotFoundException('Company tenant not found');
    }

    // 2. Fetch Defect Master mapping details to map severity/assignees
    const allCompanyDefects = await this.prisma.defectMaster.findMany({
      where: { companyId: payload.companyId }
    });
    console.log('[DEBUG Ingest] DATABASE_URL:', process.env.DATABASE_URL);
    console.log('[DEBUG Ingest] All Defects for this Company:', allCompanyDefects);

    const defect = await this.prisma.defectMaster.findFirst({
      where: { companyId: payload.companyId, name: payload.defectName, active: true },
    });
    console.log('[DEBUG Ingest] Query Result for Defect:', defect);

    if (!defect) {
      throw new NotFoundException(`Defect '${payload.defectName}' is not defined in the Defect Master`);
    }

    // Calculate next escalation date based on severity rules
    const nextEscalationAt = this.calculateNextEscalation(defect.severity);

    // 3. Create Alert, Timeline and auto assignment
    const alert = await this.prisma.$transaction(async (tx) => {
      const newAlert = await tx.alert.create({
        data: {
          vin: payload.vin,
          companyId: payload.companyId,
          defectId: defect.id,
          severity: defect.severity,
          status: AlertStatus.OPEN,
          assignedToRole: defect.defaultAssigneeRole,
          nextEscalationAt,
        },
        include: { defect: true },
      });

      // Log creation to defect audit timeline
      await tx.defectResolutionTimeline.create({
        data: {
          alertId: newAlert.id,
          actionType: 'CREATED',
          performedByRole: UserRole.QUALITY_INSPECTOR,
          details: `Defect created by source system: [${payload.source}]. Routed to default role: ${defect.defaultAssigneeRole}`,
        },
      });

      return newAlert;
    });

    // 4. Trigger Real-time Socket.IO Broadcast to company dashboard
    this.realtime.broadcastToCompany(payload.companyId, 'ALERT_CREATED', {
      id: alert.id,
      vin: alert.vin,
      defectName: defect.name,
      severity: alert.severity,
      status: alert.status,
      assignedToRole: alert.assignedToRole,
      soundProfile: defect.soundProfile,
      createdAt: alert.createdAt,
    });

    // 5. Enqueue Push Notifications for all users in the company
    const targetUsers = await this.prisma.user.findMany({
      where: { companyId: payload.companyId, isActive: true },
    });

    for (const user of targetUsers) {
      await this.notifications.enqueueNotification({
        companyId: payload.companyId,
        userId: user.id,
        alertId: alert.id,
        title: `CRITICAL ALERT: ${defect.name}`,
        message: `New defect '${defect.name}' on VIN ${alert.vin} is assigned to ${defect.defaultAssigneeRole}.`,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      });
    }

    return alert;
  }

  /**
   * Assign or Reassign Alerts to target roles/users
   */
  async assignAlert(
    companyId: string,
    alertId: string,
    performedByUserId: string,
    data: {
      assignedToUserId?: string;
      assignedToRole?: UserRole;
      assignedToDepartment?: string;
      assignedToTeam?: string;
      notes?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: performedByUserId } });
    if (!user) throw new NotFoundException('User profile not found');

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId, companyId },
      include: {
        defect: true,
        assignedToUser: {
          select: { id: true, name: true, role: true },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const updatedAlert = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.alert.update({
        where: { id: alertId },
        data: {
          assignedToUserId: data.assignedToUserId || null,
          assignedToRole: data.assignedToRole || null,
          assignedToDepartment: data.assignedToDepartment || null,
          assignedToTeam: data.assignedToTeam || null,
          status: AlertStatus.IN_PROGRESS,
          escalationStep: 0, // Reset escalation counter on active intervention
        },
        include: {
          assignedToUser: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      // Assignment history audit log
      await tx.alertAssignmentHistory.create({
        data: {
          alertId,
          assignedByUserId: performedByUserId,
          assignedToUserId: data.assignedToUserId,
          assignedToRole: data.assignedToRole,
          assignedToDepartment: data.assignedToDepartment,
          assignedToTeam: data.assignedToTeam,
          notes: data.notes,
        },
      });

      // Defect Lifecycle timeline update
      const targetName = data.assignedToUserId ? `User ID ${data.assignedToUserId}` : `Role ${data.assignedToRole}`;
      await tx.defectResolutionTimeline.create({
        data: {
          alertId,
          actionType: 'ASSIGNED',
          performedByUserId,
          performedByRole: user.role,
          details: `Alert assigned to ${targetName}. Notes: ${data.notes || 'None'}`,
        },
      });

      return updated;
    });

    // Determine the previous assignee description
    let prevAssigneeDesc = 'unassigned';
    if (alert.assignedToUser) {
      prevAssigneeDesc = `${alert.assignedToUser.name} (${alert.assignedToUser.role})`;
    } else if (alert.assignedToRole) {
      prevAssigneeDesc = `role ${alert.assignedToRole}`;
    }

    // Determine the new assignee description
    let newAssigneeDesc = 'unassigned';
    if (updatedAlert.assignedToUser) {
      newAssigneeDesc = `${updatedAlert.assignedToUser.name} (${updatedAlert.assignedToUser.role})`;
    } else if (updatedAlert.assignedToRole) {
      newAssigneeDesc = `role ${updatedAlert.assignedToRole}`;
    }

    let title = 'Defect Task Assignment';
    let message = '';

    // Check if user is taking over the task (handover)
    if (performedByUserId === data.assignedToUserId) {
      title = 'Defect Task Handover';
      message = `${user.name} (${user.role}) has taken over ${prevAssigneeDesc}'s defect task '${alert.defect.name}' on VIN ${alert.vin}.`;
    } else {
      message = `${user.name} (${user.role}) has assigned defect task '${alert.defect.name}' (VIN: ${alert.vin}) to ${newAssigneeDesc}.`;
    }

    // Notify real-time dashboard
    this.realtime.broadcastToCompany(companyId, 'ALERT_ASSIGNED', {
      alertId,
      assignedToUserId: updatedAlert.assignedToUserId,
      assignedToRole: updatedAlert.assignedToRole,
      title,
      message,
    });

    // Enqueue notifications for all active users of the company
    const activeUsers = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
    });

    for (const u of activeUsers) {
      await this.notifications.enqueueNotification({
        companyId,
        userId: u.id,
        alertId: alertId,
        title,
        message,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      });
    }

    return updatedAlert;
  }

  /**
   * Resolve Alerts mapping who resolved and storing voice log details
   */
  async resolveAlert(
    companyId: string,
    alertId: string,
    resolvedByUserId: string,
    data: {
      reason: string;
      notes?: string;
      audioPath?: string;
      transcription?: string;
      imageUrls?: string[];
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: resolvedByUserId } });
    if (!user) throw new NotFoundException('User profile not found');

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId, companyId },
      include: {
        defect: true,
        assignedToUser: {
          select: { id: true, name: true, role: true },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    if (alert.status === AlertStatus.RESOLVED) {
      throw new BadRequestException('Alert is already resolved');
    }

    const resolvedAlert = await this.prisma.$transaction(async (tx) => {
      // 1. Update Alert Status
      const updated = await tx.alert.update({
        where: { id: alertId },
        data: {
          status: AlertStatus.RESOLVED,
          nextEscalationAt: null, // Cancel escalations
        },
      });

      // 2. Write Resolution Record
      await tx.resolution.create({
        data: {
          alertId,
          resolvedByUserId,
          reason: data.reason,
          notes: data.notes,
          audioPath: data.audioPath,
          transcription: data.transcription,
          imageUrls: data.imageUrls || [],
        },
      });

      // 3. Log Timeline Audit
      await tx.defectResolutionTimeline.create({
        data: {
          alertId,
          actionType: 'RESOLVED',
          performedByUserId: resolvedByUserId,
          performedByRole: user.role,
          details: `Alert resolved by user: ${user.name} (${user.role}). Reason: ${data.reason}`,
        },
      });

      return updated;
    });

    // Notify real-time dashboards
    this.realtime.broadcastToCompany(companyId, 'ALERT_RESOLVED', {
      alertId,
      resolvedBy: user.name,
      resolvedByUserId,
      resolvedByRole: user.role,
      reason: data.reason,
    });

    // Determine the assignee description
    let assigneeDesc = 'unassigned';
    if (alert.assignedToUser) {
      assigneeDesc = `${alert.assignedToUser.name} (${alert.assignedToUser.role})`;
    } else if (alert.assignedToRole) {
      assigneeDesc = `role ${alert.assignedToRole}`;
    }

    const title = 'Defect Task Resolved';
    const commentSuffix = data.reason ? ` Comment: "${data.reason}"` : '';
    let message = '';
    if (resolvedByUserId === alert.assignedToUserId) {
      message = `${user.name} (${user.role}) has resolved their assigned defect task '${alert.defect.name}' on VIN ${alert.vin}.${commentSuffix}`;
    } else {
      message = `${user.name} (${user.role}) has resolved ${assigneeDesc}'s defect task '${alert.defect.name}' on VIN ${alert.vin}.${commentSuffix}`;
    }

    // Enqueue notifications for all active users of the company
    const activeUsers = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
    });

    for (const u of activeUsers) {
      await this.notifications.enqueueNotification({
        companyId,
        userId: u.id,
        alertId: alertId,
        title,
        message,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      });
    }

    return this.findOneAlert(companyId, alertId);
  }

  /**
   * Reopen Alerts if defects recur or fails inspector validation
   */
  async reopenAlert(companyId: string, alertId: string, performedByUserId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: performedByUserId } });
    if (!user) throw new NotFoundException('User profile not found');

    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId, companyId },
      include: { defect: true },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const reopenedAlert = await this.prisma.$transaction(async (tx) => {
      const nextEscalationAt = this.calculateNextEscalation(alert.severity);

      const updated = await tx.alert.update({
        where: { id: alertId },
        data: {
          status: AlertStatus.REOPENED,
          nextEscalationAt,
          escalationStep: 0,
        },
      });

      // Remove resolution record
      await tx.resolution.deleteMany({
        where: { alertId },
      });

      // Log Timeline
      await tx.defectResolutionTimeline.create({
        data: {
          alertId,
          actionType: 'REOPENED',
          performedByUserId,
          performedByRole: user.role,
          details: `Alert reopened by ${user.name} (${user.role}). Reason: ${reason}`,
        },
      });

      return updated;
    });

    // Broadcast
    this.realtime.broadcastToCompany(companyId, 'ALERT_REOPENED', {
      alertId,
      reopenedBy: user.name,
    });

    // Enqueue notifications for all active users of the company
    const activeUsers = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
    });

    for (const u of activeUsers) {
      await this.notifications.enqueueNotification({
        companyId,
        userId: u.id,
        alertId: alertId,
        title: 'Defect Task Reopened',
        message: `${user.name} (${user.role}) has reopened defect task '${alert.defect.name}' (VIN: ${alert.vin}). Reason: ${reason}`,
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      });
    }

    return this.findOneAlert(companyId, alertId);
  }

  /**
   * Get dynamic telemetry dashboard numbers
   */
  async getDashboardTelemetry(companyId: string) {
    const alerts = await this.prisma.alert.findMany({
      where: { 
        companyId,
        defect: { active: true },
      },
      include: { defect: true },
    });

    const openAlerts = alerts.filter(a => a.status !== AlertStatus.RESOLVED);
    const criticalAlerts = openAlerts.filter(a => a.severity === Severity.CRITICAL || a.severity === Severity.EMERGENCY);
    const resolvedToday = alerts.filter(
      a => a.status === AlertStatus.RESOLVED && new Date(a.updatedAt).toDateString() === new Date().toDateString(),
    );

    // Grouping calculations
    const severityCount = openAlerts.reduce((acc, curr) => {
      acc[curr.severity] = (acc[curr.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const categoryCount = openAlerts.reduce((acc, curr) => {
      const cat = curr.defect.category;
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      openAlertsCount: openAlerts.length,
      criticalAlertsCount: criticalAlerts.length,
      resolvedTodayCount: resolvedToday.length,
      alertsBySeverity: severityCount,
      alertsByCategory: categoryCount,
    };
  }

  /**
   * Find all alerts for the company with optional filters
   */
  async findAlerts(
    companyId: string,
    filters: {
      status?: AlertStatus;
      severity?: Severity;
      assignedToUserId?: string;
      assignedToRole?: UserRole;
    },
  ) {
    return this.prisma.alert.findMany({
      where: {
        companyId,
        defect: { active: true },
        ...(filters.status && { status: filters.status }),
        ...(filters.severity && { severity: filters.severity }),
        ...(filters.assignedToUserId && { assignedToUserId: filters.assignedToUserId }),
        ...(filters.assignedToRole && { assignedToRole: filters.assignedToRole }),
      },
      include: {
        defect: true,
        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        resolution: {
          include: {
            resolvedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a single alert detail with relations
   */
  async findOneAlert(companyId: string, alertId: string) {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, companyId },
      include: {
        defect: true,
        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        resolution: {
          include: {
            resolvedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        timeline: {
          include: {
            performedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          include: {
            assignedByUser: {
              select: { id: true, name: true, role: true },
            },
            assignedToUser: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    return alert;
  }

  /**
   * Add comment to an alert
   */
  async addComment(
    companyId: string,
    alertId: string,
    userId: string,
    data: {
      commentText: string;
      audioPath?: string;
      transcription?: string;
    },
  ) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId, companyId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    const comment = await this.prisma.resolutionComment.create({
      data: {
        alertId,
        userId,
        commentText: data.commentText,
        audioPath: data.audioPath,
        transcription: data.transcription,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Audit timeline log
    await this.prisma.defectResolutionTimeline.create({
      data: {
        alertId,
        actionType: 'NOTE_ADDED',
        performedByUserId: userId,
        performedByRole: comment.user.role,
        details: `Note added: "${data.commentText.slice(0, 60)}${data.commentText.length > 60 ? '...' : ''}"`,
      },
    });

    // Real-time broadcast
    this.realtime.broadcastToCompany(companyId, 'COMMENT_ADDED', {
      alertId,
      commentId: comment.id,
      commentText: comment.commentText,
      userName: comment.user.name,
      createdAt: comment.createdAt,
    });

    return comment;
  }

  private calculateNextEscalation(severity: Severity): Date {
    const now = new Date();
    // Default escalations rule triggers
    switch (severity) {
      case Severity.EMERGENCY:
        return new Date(now.getTime() + 15 * 60 * 1000); // 15 mins
      case Severity.CRITICAL:
        return new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1 hour
      case Severity.HIGH:
        return new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours
      case Severity.MEDIUM:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      default:
        return new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
    }
  }
}

