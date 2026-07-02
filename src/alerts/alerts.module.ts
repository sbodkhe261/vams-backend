import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { EscalationService } from './escalation.service';
import { AlertsController } from './alerts.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [AlertsController],
  providers: [AlertsService, EscalationService],
  exports: [AlertsService, EscalationService],
})
export class AlertsModule {}
