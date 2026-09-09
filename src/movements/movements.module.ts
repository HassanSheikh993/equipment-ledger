import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { Movement, MovementSchema } from './movement.schema';
import { AssetsModule } from '../assets/assets.module';
import { WorkersModule } from '../workers/workers.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Movement.name, schema: MovementSchema },
    ]),
    AssetsModule, // Asset model - heldBy concurrency guard on issue/return
    WorkersModule, // Worker model - certification gate on issue
    ReservationsModule, // Reservation model - issue against / block on a reservation
  ],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MongooseModule],
})
export class MovementsModule {}
