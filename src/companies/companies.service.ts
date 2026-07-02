import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(name: string) {
    const existing = await this.prisma.company.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('Company with this name/code is already registered');
    }

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name },
      });

      // Default settings setup (including default sound profiles matching Play guidelines)
      const settings = await tx.companySettings.create({
        data: {
          companyId: company.id,
          soundInfo: 'soft_bell.mp3',
          soundWarning: 'chime.mp3',
          soundCritical: 'alarm.mp3',
          soundEmergency: 'siren.mp3',
        },
      });

      return { ...company, settings };
    });
  }

  async getSettings(companyId: string) {
    const settings = await this.prisma.companySettings.findUnique({
      where: { companyId },
    });
    if (!settings) {
      throw new NotFoundException('Company settings not found');
    }
    return settings;
  }

  async updateSettings(companyId: string, data: any) {
    return this.prisma.companySettings.update({
      where: { companyId },
      data,
    });
  }

  async findOne(idOrName: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);
    let company = null;
    if (isUuid) {
      company = await this.prisma.company.findUnique({
        where: { id: idOrName },
      });
    }

    if (!company) {
      company = await this.prisma.company.findUnique({
        where: { name: idOrName },
      });
    }

    if (!company) {
      try {
        company = await this.prisma.$transaction(async (tx) => {
          const newComp = await tx.company.create({
            data: { name: idOrName },
          });

          await tx.companySettings.create({
            data: {
              companyId: newComp.id,
              soundInfo: 'soft_bell.mp3',
              soundWarning: 'chime.mp3',
              soundCritical: 'alarm.mp3',
              soundEmergency: 'siren.mp3',
            },
          });

          return newComp;
        });
      } catch (err) {
        // Uniqueness race condition: check if it was created in the meantime
        company = await this.prisma.company.findUnique({
          where: { name: idOrName },
        });
        if (!company) {
          throw err;
        }
      }
    }
    return company;
  }

  async findUsers(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
