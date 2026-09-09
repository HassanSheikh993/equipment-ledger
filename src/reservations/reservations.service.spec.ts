import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ReservationsService } from './reservations.service';
import { Reservation } from './reservation.schema';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';

describe('ReservationsService', () => {
  let service: ReservationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getModelToken(Reservation.name), useValue: {} },
        { provide: getModelToken(Asset.name), useValue: {} },
        { provide: getModelToken(Worker.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
