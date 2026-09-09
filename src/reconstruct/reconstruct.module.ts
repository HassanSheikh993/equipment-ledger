import { Module } from '@nestjs/common';
import { ReconstructController } from './reconstruct.controller';
import { ReconstructService } from './reconstruct.service';
import { AssetsModule } from '../assets/assets.module';
import { WorkersModule } from '../workers/workers.module';
import { MovementsModule } from '../movements/movements.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  // All read models come from the feature modules that own them.
  imports: [AssetsModule, WorkersModule, MovementsModule, ReservationsModule],
  controllers: [ReconstructController],
  providers: [ReconstructService],
})
export class ReconstructModule {}
