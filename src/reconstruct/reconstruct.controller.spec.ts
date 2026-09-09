import { Test, TestingModule } from '@nestjs/testing';
import { ReconstructController } from './reconstruct.controller';
import { ReconstructService } from './reconstruct.service';

describe('ReconstructController', () => {
  let controller: ReconstructController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReconstructController],
      providers: [{ provide: ReconstructService, useValue: {} }],
    }).compile();

    controller = module.get<ReconstructController>(ReconstructController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
