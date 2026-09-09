import { Body, Controller, Post } from '@nestjs/common';
import { MovementsService } from './movements.service';
import { IssueMovementDto } from './dto/issue-movement.dto';
import { ReturnMovementDto } from './dto/return-movement.dto';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Post('issue')
  issue(@Body() dto: IssueMovementDto) {
    return this.movementsService.issue(dto);
  }

  @Post('return')
  return(@Body() dto: ReturnMovementDto) {
    return this.movementsService.return(dto);
  }
}
