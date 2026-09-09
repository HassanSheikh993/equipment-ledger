import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ReconstructService } from './reconstruct.service';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';
import { Movement } from '../movements/movement.schema';
import { Reservation } from '../reservations/reservation.schema';

describe('ReconstructService', () => {
  let service: ReconstructService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconstructService,
        { provide: getModelToken(Asset.name), useValue: {} },
        { provide: getModelToken(Worker.name), useValue: {} },
        { provide: getModelToken(Movement.name), useValue: {} },
        { provide: getModelToken(Reservation.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ReconstructService>(ReconstructService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
