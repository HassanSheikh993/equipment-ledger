import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MovementsService } from './movements.service';
import { Movement } from './movement.schema';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';
import { Reservation } from '../reservations/reservation.schema';

describe('MovementsService', () => {
  let service: MovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementsService,
        { provide: getModelToken(Movement.name), useValue: {} },
        { provide: getModelToken(Asset.name), useValue: {} },
        { provide: getModelToken(Worker.name), useValue: {} },
        { provide: getModelToken(Reservation.name), useValue: {} },
      ],
    }).compile();

    service = module.get<MovementsService>(MovementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
