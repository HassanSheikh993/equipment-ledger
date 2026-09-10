import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';
import { Movement } from '../movements/movement.schema';
import { Reservation } from '../reservations/reservation.schema';

// One assets last movement at or before the "as of" instant
type LastMovement = {
  _id: Types.ObjectId; // assetId
  type: string;
  workerId: Types.ObjectId;
  since: Date;
};

@Injectable()
export class ReconstructService {
  constructor(
    @InjectModel(Asset.name) private assetModel: Model<Asset>,
    @InjectModel(Worker.name) private workerModel: Model<Worker>,
    @InjectModel(Movement.name) private movementModel: Model<Movement>,
    @InjectModel(Reservation.name)
    private reservationModel: Model<Reservation>,
  ) {}

  // The whole store as it stood at a past instant, rebuilt from the ledger.
  async asOf(at: Date) {
    const assets = await this.assetModel.find().sort({ code: 1 });

    // Per asset, the last non-superseded movement that happened at or before `at`.
    const lasts = await this.movementModel.aggregate<LastMovement>([
      { $match: { occurredAt: { $lte: at }, supersededBy: null } },
      { $sort: { occurredAt: 1, recordedAt: 1, _id: 1 } },
      {
        $group: {
          _id: '$assetId',
          type: { $last: '$type' },
          workerId: { $last: '$workerId' },
          since: { $last: '$occurredAt' },
        },
      },
    ]);
    const lastByAsset = new Map(lasts.map((l) => [l._id.toString(), l]));

    const holderIds = lasts
      .filter((l) => l.type === 'issue')
      .map((l) => l.workerId);
    const workers = await this.workerModel.find({ _id: { $in: holderIds } });
    const nameById = new Map(workers.map((w) => [w._id.toString(), w.name]));

    const result = assets.map((asset) => {
      const last = lastByAsset.get(asset._id.toString());
      const held = last?.type === 'issue';
      return {
        assetId: asset._id,
        code: asset.code,
        kind: asset.kind,
        state: held ? 'issued' : 'in-store',
        heldBy: held
          ? {
              workerId: last.workerId,
              name: nameById.get(last.workerId.toString()) ?? null,
            }
          : null,
        since: held ? last.since : null,

        outOfService: asset.outOfService,
      };
    });

    return { at, assets: result };
  }

  async assetHistory(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Asset not found');
    }
    const asset = await this.assetModel.findById(id);
    if (!asset) throw new NotFoundException('Asset not found');

    const [movements, reservations] = await Promise.all([
      this.movementModel
        .find({ assetId: id })
        .sort({ occurredAt: 1, recordedAt: 1, _id: 1 })
        .populate('workerId'),
      this.reservationModel
        .find({ assetId: id })
        .sort({ windowStart: 1 })
        .populate('workerId'),
    ]);

    return { asset, movements, reservations };
  }
}
