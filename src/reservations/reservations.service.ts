import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';
import { Reservation, ReservationDocument } from './reservation.schema';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';

// Tolerance for clock differences between the storekeeper laptop and server
const PAST_TOLERANCE_MS = 2 * 60 * 1000;
// A site tool store books days not months.
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name)
    private reservationModel: Model<Reservation>,
    @InjectModel(Asset.name) private assetModel: Model<Asset>,
    @InjectModel(Worker.name) private workerModel: Model<Worker>,
  ) {}

  async create(dto: CreateReservationDto) {
    
    const existing = await this.reservationModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);

   
    if (windowStart >= windowEnd) {
      throw new BadRequestException('windowEnd must be after windowStart');
    }
    if (windowStart.getTime() < Date.now() - PAST_TOLERANCE_MS) {
      throw new BadRequestException('Cannot reserve a window in the past');
    }
    if (windowEnd.getTime() - windowStart.getTime() > MAX_WINDOW_MS) {
      throw new BadRequestException(
        'Reservation cannot be longer than 30 days',
      );
    }

    // asset exists
    const asset = await this.assetModel.findById(dto.assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    // asset out of service
    if (asset.outOfService) {
      throw new ConflictException(
        `Asset ${asset.code} is out of service and cannot be reserved`,
      );
    }

    // worker exists
    const worker = await this.workerModel.findById(dto.workerId);
    if (!worker) throw new NotFoundException('Worker not found');

   
    const clash = await this.reservationModel.findOne({
      assetId: dto.assetId,
      status: 'active',
      windowStart: { $lt: windowEnd },
      windowEnd: { $gt: windowStart },
    });
    if (clash) {
      throw new ConflictException(
        `Asset ${asset.code} is already reserved for an overlapping window`,
      );
    }

    let reservation: ReservationDocument;
    try {
      reservation = await this.reservationModel.create({
        assetId: dto.assetId,
        workerId: dto.workerId,
        windowStart,
        windowEnd,
        status: 'active',
        idempotencyKey: dto.idempotencyKey,
        recordedBy: dto.recordedBy,
      });
    } catch (err) {
     
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.reservationModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (winner) return this.withAssetAndWorker(winner);
      }
      throw err;
    }

    const raced = await this.reservationModel.findOne({
      _id: { $lt: reservation._id },
      assetId: dto.assetId,
      status: 'active',
      windowStart: { $lt: windowEnd },
      windowEnd: { $gt: windowStart },
    });
    if (raced) {
      await this.reservationModel.deleteOne({ _id: reservation._id });
      throw new ConflictException(
        `Asset ${asset.code} is already reserved for an overlapping window`,
      );
    }

    return this.withAssetAndWorker(reservation);
  }

  async cancel(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Reservation not found');
    }
    
    const reservation = await this.reservationModel.findOneAndUpdate(
      { _id: id, status: 'active' },
      { $set: { status: 'cancelled' } },
      { new: true },
    );
    if (!reservation) {
      throw new ConflictException(
        'Reservation is not active (not found, or already cancelled/collected/expired)',
      );
    }
    return this.withAssetAndWorker(reservation);
  }

  async list(dto: ListReservationsDto) {
    const filter: Record<string, unknown> = {};
    if (dto.assetId) filter.assetId = dto.assetId;
    if (dto.workerId) filter.workerId = dto.workerId;
    if (dto.status) filter.status = dto.status;

    return this.reservationModel
      .find(filter)
      .sort({ windowStart: 1 })
      .populate(['assetId', 'workerId']);
  }

  private withAssetAndWorker(reservation: ReservationDocument) {
    return reservation.populate(['assetId', 'workerId']);
  }
}
