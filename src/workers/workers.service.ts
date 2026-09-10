import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Worker } from './worker.schema';
import { CreateWorkerDto } from './dto/create-worker.dto';

@Injectable()
export class WorkersService {
  constructor(@InjectModel(Worker.name) private workerModel: Model<Worker>) {}

  list() {
    return this.workerModel.find().sort({ name: 1 });
  }

  create(dto: CreateWorkerDto) {
    return this.workerModel.create({
      name: dto.name,
      certifications: (dto.certifications ?? []).map((c) => ({
        name: c.name,
        expiryDate: new Date(c.expiryDate),
      })),
    });
  }
}
