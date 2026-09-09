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

// Tolerance for clock differences between the storekeeper's laptop and server.
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
    // 1. Idempotency fast path. The unique index is the real guard (see step 9).
    const existing = await this.movementModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    const occurredAt = new Date(dto.occurredAt);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    // 2. occurredAt sanity.
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('occurredAt is in the future');
    }
    if (dueAt && dueAt <= occurredAt) {
      throw new BadRequestException('dueAt must be after occurredAt');
    }

    // 3. Asset exists.
    const asset = await this.assetModel.findById(dto.assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    // 4. Asset out of service.
    if (asset.outOfService) {
      throw new ConflictException(
        `Asset ${asset.code} is out of service: ${asset.outOfServiceReason ?? 'no reason given'}`,
      );
    }

    // 5. Asset already held (friendly early check; step 8 is the real lock).
    if (asset.heldBy) {
      throw new ConflictException(`Asset ${asset.code} is already issued`);
    }

    // 6. Worker exists.
    const worker = await this.workerModel.findById(dto.workerId);
    if (!worker) throw new NotFoundException('Worker not found');

    // 7. Certification gate. Valid only if the cert expires strictly after
    // occurredAt (expiry on the day of issue counts as expired).
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

    // 8. Reservations.
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
      // No reservation given: block if someone else holds an active reservation
      // covering this moment.
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

    // 9. Concurrency lock — the line that makes double-issue impossible.
    const lock = await this.assetModel.updateOne(
      { _id: dto.assetId, heldBy: null },
      { $set: { heldBy: dto.workerId } },
    );
    if (lock.matchedCount === 0) {
      throw new ConflictException(`Asset ${asset.code} is already issued`);
    }

    // 10. Save the movement. If anything below fails, release the lock.
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
      // Duplicate idempotencyKey slipped past step 1 — return the winner.
      if ((err as { code?: number }).code === 11000) {
        const winner = await this.movementModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (winner) return this.withAssetAndWorker(winner);
      }
      throw err;
    }

    // 11. Mark the reservation collected.
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

    // 12. Return the movement with asset + worker details.
    return this.withAssetAndWorker(movement);
  }

  async return(dto: ReturnMovementDto) {
    // 1. Idempotency fast path. The unique index is the real guard (see step 7).
    const existing = await this.movementModel.findOne({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) return this.withAssetAndWorker(existing);

    const occurredAt = new Date(dto.occurredAt);

    // 2. occurredAt sanity.
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('occurredAt is in the future');
    }

    // 3. Asset exists.
    const asset = await this.assetModel.findById(dto.assetId);
    if (!asset) throw new NotFoundException('Asset not found');

    // 4. Asset is currently issued.
    if (!asset.heldBy) {
      throw new ConflictException(`Asset ${asset.code} is not issued`);
    }
    const holderId = asset.heldBy;

    // 5. Worker handing it back exists (not matched against the holder).
    const worker = await this.workerModel.findById(dto.workerId);
    if (!worker) throw new NotFoundException('Worker not found');

    // 6. The open issue this return closes. The asset is held, so the latest
    // issue movement is the open one - and also the asset's last event, which
    // is why "after the issue" is enough to reject a backdated return.
    const openIssue = await this.movementModel
      .findOne({ assetId: dto.assetId, type: 'issue' })
      .sort({ occurredAt: -1 });
    if (!openIssue) {
      throw new ConflictException(
        `Asset ${asset.code} has no open issue to close`,
      );
    }
    if (occurredAt <= openIssue.occurredAt) {
      throw new BadRequestException('Return time is before the issue time');
    }

    // 7. Atomic release — the line that stops two returns landing at once.
    const release = await this.assetModel.updateOne(
      { _id: dto.assetId, heldBy: holderId },
      { $set: { heldBy: null } },
    );
    if (release.matchedCount === 0) {
      throw new ConflictException(`Asset ${asset.code} is not issued`);
    }

    // 8. Save the return movement. If it fails, put the hold back.
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

    // 9. Damaged -> asset goes out of service.
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

    // 10. Return the movement with asset + worker details.
    return this.withAssetAndWorker(movement);
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
