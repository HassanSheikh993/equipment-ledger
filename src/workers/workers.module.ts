import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { Worker, WorkerSchema } from './worker.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Worker.name, schema: WorkerSchema }]),
  ],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [MongooseModule],
})
export class WorkersModule {}
