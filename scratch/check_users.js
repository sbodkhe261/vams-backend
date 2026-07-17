const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        company: { select: { name: true } }
      }
    });
    console.log('--- USERS ---');
    console.log(JSON.stringify(users, null, 2));

    const alerts = await prisma.alert.findMany({
      select: {
        id: true,
        vin: true,
        companyId: true,
        defectName: true,
        defectId: true,
        severity: true,
        status: true,
        assignedToUserId: true,
        assignedToRole: true,
        isManual: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('--- RECENT ALERTS ---');
    console.log(JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
