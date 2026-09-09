import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto) {
    return this.reservationsService.create(dto);
  }

  @Get()
  list(@Query() dto: ListReservationsDto) {
    return this.reservationsService.list(dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.reservationsService.cancel(id);
  }
}
