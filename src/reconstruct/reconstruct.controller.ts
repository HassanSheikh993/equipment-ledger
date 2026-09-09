import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReconstructService } from './reconstruct.service';
import { AsOfDto } from './dto/as-of.dto';

@Controller('reconstruct')
export class ReconstructController {
  constructor(private readonly reconstructService: ReconstructService) {}

  @Get('as-of')
  asOf(@Query() dto: AsOfDto) {
    return this.reconstructService.asOf(new Date(dto.at));
  }

  // One assets full history.
  @Get('assets/:id')
  assetHistory(@Param('id') id: string) {
    return this.reconstructService.assetHistory(id);
  }
}
