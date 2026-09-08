import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { Movement, MovementSchema } from './movement.schema';
import { AssetsModule } from '../assets/assets.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Movement.name, schema: MovementSchema }]),
    AssetsModule, // Asset model - heldBy concurrency guard on issue/return
    WorkersModule, // Worker model - certification gate on issue
  ],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MongooseModule],
})
export class MovementsModule {}
