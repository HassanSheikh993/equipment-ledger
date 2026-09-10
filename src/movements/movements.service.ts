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
import { Reservation } from '../reservations/reservation.schema';
import { Movement, MovementDocument } from './movement.schema';
import { IssueMovementDto } from './dto/issue-movement.dto';
import { ReturnMovementDto } from './dto/return-movement.dto';
import { CorrectMovementDto } from './dto/correct-movement.dto';

const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

@Injectable()
export class MovementsService {
  constructor(
    @InjectModel(Movement.name) private movementModel: Model<Movement>,
    @InjectModel(Asset.name) private assetModel: Model<Asset>,
    @InjectModel(Worker.name) private workerModel: Model<Worker>,
    @InjectModel(Reservation.name)
    private reservationModel: Model<Reservation>,
  ) {}

  async issue(dto: IssueMovementDto) {
    const existing = await this.movementModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    const occurredAt = new Date(dto.occurredAt);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('occurredAt is in the future');
    }
    if (dueAt && dueAt <= occurredAt) {
      throw new BadRequestException('dueAt must be after occurredAt');
    }

    const asset = await this.assetModel.findById(dto.assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    if (asset.outOfService) {
      throw new ConflictException(
        `Asset ${asset.code} is out of service: ${asset.outOfServiceReason ?? 'no reason given'}`,
      );
    }

    if (asset.heldBy) {
      throw new ConflictException(`Asset ${asset.code} is already issued`);
    }

    const worker = await this.workerModel.findById(dto.workerId);
    if (!worker) throw new NotFoundException('Worker not found');

    if (asset.requiresCertification) {
      const cert = worker.certifications.find(
        (c) => c.name === asset.certificationName,
      );
      if (!cert) {
        throw new ConflictException(
          `${worker.name} is missing the ${asset.certificationName} certification`,
        );
      }
      if (new Date(cert.expiryDate) <= occurredAt) {
        throw new ConflictException(
          `${worker.name}'s ${asset.certificationName} certification has expired`,
        );
      }
    }

    if (dto.reservationId) {
      const reservation = await this.reservationModel.findById(
        dto.reservationId,
      );
      if (
        !reservation ||
        reservation.status !== 'active' ||
        reservation.assetId.toString() !== dto.assetId ||
        reservation.workerId.toString() !== dto.workerId
      ) {
        throw new BadRequestException(
          'Reservation is not valid for this asset and worker',
        );
      }
    } else {
      const blocking = await this.reservationModel.findOne({
        assetId: dto.assetId,
        status: 'active',
        workerId: { $ne: dto.workerId },
        windowStart: { $lte: occurredAt },
        windowEnd: { $gte: occurredAt },
      });
      if (blocking) {
        throw new ConflictException(
          `Asset ${asset.code} is reserved by another worker for this time`,
        );
      }
    }

    const lock = await this.assetModel.updateOne(
      { _id: dto.assetId, heldBy: null },
      { $set: { heldBy: dto.workerId } },
    );
    if (lock.matchedCount === 0) {
      throw new ConflictException(`Asset ${asset.code} is already issued`);
    }

    let movement: MovementDocument;
    try {
      movement = await this.movementModel.create({
        assetId: dto.assetId,
        workerId: dto.workerId,
        type: 'issue',
        occurredAt,
        recordedAt: new Date(),
        dueAt,
        recordedBy: dto.recordedBy,
        idempotencyKey: dto.idempotencyKey,
      });
    } catch (err) {
      await this.releaseLock(dto.assetId, dto.workerId);

      if ((err as { code?: number }).code === 11000) {
        const winner = await this.movementModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (winner) return this.withAssetAndWorker(winner);
      }
      throw err;
    }

    if (dto.reservationId) {
      try {
        await this.reservationModel.updateOne(
          { _id: dto.reservationId },
          { $set: { status: 'collected' } },
        );
      } catch (err) {
        await this.movementModel.deleteOne({ _id: movement._id });
        await this.releaseLock(dto.assetId, dto.workerId);
        throw err;
      }
    }

    return this.withAssetAndWorker(movement);
  }

  async return(dto: ReturnMovementDto) {
    const existing = await this.movementModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    const occurredAt = new Date(dto.occurredAt);

    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('occurredAt is in the future');
    }

    const asset = await this.assetModel.findById(dto.assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    if (!asset.heldBy) {
      throw new ConflictException(`Asset ${asset.code} is not issued`);
    }
    const holderId = asset.heldBy;

    const worker = await this.workerModel.findById(dto.workerId);
    if (!worker) throw new NotFoundException('Worker not found');

    const openIssue = await this.movementModel
      .findOne({ assetId: dto.assetId, type: 'issue' })
      .sort({ occurredAt: -1 });
    if (!openIssue) {
      throw new ConflictException(
        `Asset ${asset.code} has no open issue to close`,
      );
    }
    if (occurredAt < openIssue.occurredAt) {
      throw new BadRequestException('Return time is before the issue time');
    }

    const release = await this.assetModel.updateOne(
      { _id: dto.assetId, heldBy: holderId },
      { $set: { heldBy: null } },
    );
    if (release.matchedCount === 0) {
      throw new ConflictException(`Asset ${asset.code} is not issued`);
    }

    let movement: MovementDocument;
    try {
      movement = await this.movementModel.create({
        assetId: dto.assetId,
        workerId: dto.workerId,
        type: 'return',
        occurredAt,
        recordedAt: new Date(),
        closesMovementId: openIssue._id,
        note: dto.damaged ? dto.damageReason : null,
        recordedBy: dto.recordedBy,
        idempotencyKey: dto.idempotencyKey,
      });
    } catch (err) {
      await this.restoreHold(dto.assetId, holderId);
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.movementModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (winner) return this.withAssetAndWorker(winner);
      }
      throw err;
    }

    if (dto.damaged) {
      try {
        await this.assetModel.updateOne(
          { _id: dto.assetId },
          {
            $set: {
              outOfService: true,
              outOfServiceReason: dto.damageReason,
            },
          },
        );
      } catch (err) {
        await this.movementModel.deleteOne({ _id: movement._id });
        await this.restoreHold(dto.assetId, holderId);
        throw err;
      }
    }

    return this.withAssetAndWorker(movement);
  }

  async correct(id: string, dto: CorrectMovementDto) {
    const existing = await this.movementModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Movement not found');
    }
    const original = await this.movementModel.findById(id);
    if (!original) throw new NotFoundException('Movement not found');
    if (original.supersededBy) {
      throw new ConflictException(
        'This movement was already corrected; correct the latest version',
      );
    }

    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('occurredAt is in the future');
    }

    if (original.type === 'return') {
      if (original.closesMovementId) {
        const issue = await this.movementModel.findById(
          original.closesMovementId,
        );
        if (issue && occurredAt < issue.occurredAt) {
          throw new BadRequestException(
            'Corrected return time is before the issue time',
          );
        }
      }
    } else {
      const closingReturn = await this.movementModel.findOne({
        closesMovementId: original._id,
        supersededBy: null,
      });
      if (closingReturn && occurredAt > closingReturn.occurredAt) {
        throw new BadRequestException(
          'Corrected issue time is after its return',
        );
      }
    }

    let correction: MovementDocument;
    try {
      correction = await this.movementModel.create({
        assetId: original.assetId,
        workerId: original.workerId,
        type: original.type,
        occurredAt,
        recordedAt: new Date(),
        dueAt: original.dueAt,
        closesMovementId: original.closesMovementId,
        isCorrection: true,
        corrects: original._id,
        note: dto.note ?? original.note,
        recordedBy: dto.recordedBy,
        idempotencyKey: dto.idempotencyKey,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.movementModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (winner) return this.withAssetAndWorker(winner);
      }
      throw err;
    }

    try {
      await this.movementModel.updateOne(
        { _id: original._id },
        { $set: { supersededBy: correction._id } },
      );
    } catch (err) {
      await this.movementModel.deleteOne({ _id: correction._id });
      throw err;
    }

    return this.withAssetAndWorker(correction);
  }

  private releaseLock(assetId: string, workerId: string) {
    return this.assetModel.updateOne(
      { _id: assetId, heldBy: workerId },
      { $set: { heldBy: null } },
    );
  }

  private restoreHold(assetId: string, holderId: Types.ObjectId) {
    return this.assetModel.updateOne(
      { _id: assetId, heldBy: null },
      { $set: { heldBy: holderId } },
    );
  }

  private withAssetAndWorker(movement: MovementDocument) {
    return movement.populate(['assetId', 'workerId']);
  }
}
