import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Severity, UserRole } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class DefectsService {
  constructor(
    private prisma: PrismaService,
    private alertsService: AlertsService,
  ) {}

  async create(companyId: string, data: {
    name: string;
    category: string;
    severity: Severity;
    defaultAssigneeRole?: UserRole;
    ownerVisible?: boolean;
    soundProfile?: string;
  }) {
    // Prevent duplicate defect names inside same company
    const existing = await this.prisma.defectMaster.findFirst({
      where: { companyId, name: data.name },
    });

    if (existing) {
      throw new ConflictException('Defect with this name already exists in the company catalog');
    }

    const defect = await this.prisma.defectMaster.create({
      data: {
        ...data,
        companyId,
      },
    });

    // Automatically trigger a live test Alert on the dashboard for this new defect catalog item!
    try {
      const randomVinSuffix = Math.floor(10000 + Math.random() * 90000);
      await this.alertsService.ingestEvent({
        source: 'MANUAL_CATALOG_ENTRY',
        event_type: 'DEFECT_REGISTERED',
        companyId,
        vin: `VIN-TEST-${randomVinSuffix}`,
        defectName: defect.name,
      });
    } catch (err) {
      console.error('Failed to trigger auto-alert for newly created defect:', err);
    }

    return defect;
  }

  async findAll(companyId: string) {
    return this.prisma.defectMaster.findMany({
      where: { companyId, active: true },
    });
  }

  async deactivate(companyId: string, id: string) {
    return this.prisma.defectMaster.update({
      where: { id, companyId },
      data: { active: false },
    });
  }
}
