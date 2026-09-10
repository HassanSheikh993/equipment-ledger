import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { OutOfServiceDto } from './dto/out-of-service.dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  list(@Query() dto: ListAssetsDto) {
    return this.assetsService.list(dto);
  }

  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.assetsService.create(dto);
  }

  @Patch(':id/out-of-service')
  markOutOfService(@Param('id') id: string, @Body() dto: OutOfServiceDto) {
    return this.assetsService.markOutOfService(id, dto.reason);
  }
}
