import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Asset } from '../assets/asset.schema';
import { Movement, MovementDocument } from '../movements/movement.schema';
import {
  Reservation,
  ReservationDocument,
} from '../reservations/reservation.schema';

type Failure = string;

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const assets = app.get<Model<Asset>>(getModelToken(Asset.name));
  const movements = app.get<Model<Movement>>(getModelToken(Movement.name));
  const reservations = app.get<Model<Reservation>>(
    getModelToken(Reservation.name),
  );

  const failures: Failure[] = [];

  const allAssets = await assets.find();
  const allMovements = await movements
    .find({ supersededBy: null })
    .sort({ occurredAt: 1, recordedAt: 1, _id: 1 });

  const movesByAsset = new Map<string, MovementDocument[]>();
  for (const m of allMovements) {
    const key = m.assetId.toString();
    const list = movesByAsset.get(key) ?? [];
    list.push(m);
    movesByAsset.set(key, list);
  }

  for (const asset of allAssets) {
    const list = movesByAsset.get(asset._id.toString()) ?? [];
    const last = list[list.length - 1];
    const expectedHolder =
      last && last.type === 'issue' ? last.workerId.toString() : null;
    const actualHolder = asset.heldBy ? asset.heldBy.toString() : null;
    if (expectedHolder !== actualHolder) {
      failures.push(
        `Asset ${asset.code}: heldBy is ${actualHolder ?? 'null'} but the ledger says ${expectedHolder ?? 'null'}`,
      );
    }
  }

  const issueById = new Map<string, MovementDocument>();
  for (const m of allMovements) {
    if (m.type === 'issue') issueById.set(m._id.toString(), m);
  }
  for (const m of allMovements) {
    if (m.type !== 'return' || !m.closesMovementId) continue;
    const issue = issueById.get(m.closesMovementId.toString());
    if (issue && m.occurredAt < issue.occurredAt) {
      failures.push(
        `Return ${m._id.toString()} at ${m.occurredAt.toISOString()} is before its issue at ${issue.occurredAt.toISOString()}`,
      );
    }
  }

  const activeRes = await reservations.find({ status: 'active' });
  const resByAsset = new Map<string, ReservationDocument[]>();
  for (const r of activeRes) {
    const key = r.assetId.toString();
    const list = resByAsset.get(key) ?? [];
    list.push(r);
    resByAsset.set(key, list);
  }
  for (const [assetKey, list] of resByAsset) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.windowStart < b.windowEnd && a.windowEnd > b.windowStart) {
          failures.push(
            `Asset ${assetKey}: active reservations ${a._id.toString()} and ${b._id.toString()} overlap`,
          );
        }
      }
    }
  }

  for (const [label, model] of [
    ['movements', movements],
    ['reservations', reservations],
  ] as const) {
    const dupes = await model.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$idempotencyKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    for (const d of dupes) {
      failures.push(`${label}: idempotencyKey ${d._id} used ${d.count} times`);
    }
  }

  await app.close();

  if (failures.length === 0) {
    console.log('Invariant check PASSED');
    console.log(
      `  ${allAssets.length} assets, ${allMovements.length} live movements, ${activeRes.length} active reservations`,
    );
    process.exit(0);
  }

  console.error(`Invariant check FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

run().catch((err) => {
  console.error('Check failed to run:', err);
  process.exit(1);
});
