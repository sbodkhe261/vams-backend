import { Module } from '@nestjs/common';
import { DefectsService } from './defects.service';
import { DefectsController } from './defects.controller';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [DefectsController],
  providers: [DefectsService],
  exports: [DefectsService],
})
export class DefectsModule {}
