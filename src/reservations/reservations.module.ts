import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { Reservation, ReservationSchema } from './reservation.schema';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
    ]),
    AssetsModule, // Asset model - block reserving an out-of-service asset
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [MongooseModule],
})
export class ReservationsModule {}
