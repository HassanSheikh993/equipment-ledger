import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Asset } from '../assets/asset.schema';
import { Worker } from '../workers/worker.schema';
import { Movement } from '../movements/movement.schema';
import { Reservation } from '../reservations/reservation.schema';

// Deterministic in structure, anchored to the moment the seed runs. Running it
// twice wipes and rebuilds the same store - it never doubles.
const KEEPER = 'Store Keeper';
const DAY = 24 * 60 * 60 * 1000;

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const assets = app.get<Model<Asset>>(getModelToken(Asset.name));
  const workers = app.get<Model<Worker>>(getModelToken(Worker.name));
  const movements = app.get<Model<Movement>>(getModelToken(Movement.name));
  const reservations = app.get<Model<Reservation>>(
    getModelToken(Reservation.name),
  );

  await Promise.all([
    assets.deleteMany({}),
    workers.deleteMany({}),
    movements.deleteMany({}),
    reservations.deleteMany({}),
  ]);

  const NOW = new Date();
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
  const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);
  const at = (base: Date, h: number, m = 0) => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };

  let mvSeq = 0;
  const mvKey = () => `seed-mv-${String(++mvSeq).padStart(4, '0')}`;

  // ---------- Workers ----------
  const workerSpecs: {
    name: string;
    certs: { name: string; expiresInDays: number }[];
  }[] = [
    {
      name: 'Ahmed Khan',
      certs: [{ name: 'Working at Height', expiresInDays: 210 }],
    },
    { name: 'Bilal Toor', certs: [{ name: 'Gas Safety', expiresInDays: 130 }] },
    { name: 'Carlos Diaz', certs: [] },
    // expired cert - fails a certified issue
    {
      name: 'Danish Ali',
      certs: [{ name: 'Working at Height', expiresInDays: -6 }],
    },
    // cert expires inside the seeded 30-day window
    {
      name: 'Erik Johansson',
      certs: [{ name: 'Gas Safety', expiresInDays: 11 }],
    },
    {
      name: 'Farhan Iqbal',
      certs: [
        { name: 'Working at Height', expiresInDays: 320 },
        { name: 'Gas Safety', expiresInDays: 320 },
      ],
    },
    { name: 'Gohar Shah', certs: [] },
    { name: 'Hassan Raza', certs: [{ name: 'Gas Safety', expiresInDays: 95 }] },
    {
      name: 'Imran Malik',
      certs: [{ name: 'Working at Height', expiresInDays: 40 }],
    },
    { name: 'Junaid Akram', certs: [] },
    {
      name: 'Kamran Butt',
      certs: [{ name: 'Working at Height', expiresInDays: 160 }],
    },
    { name: 'Laiba Noor', certs: [{ name: 'Gas Safety', expiresInDays: 240 }] },
  ];
  const workerDocs = await workers.insertMany(
    workerSpecs.map((w) => ({
      name: w.name,
      certifications: w.certs.map((c) => ({
        name: c.name,
        expiryDate: daysAhead(c.expiresInDays),
      })),
    })),
  );
  const W = (name: string): Types.ObjectId => {
    const found = workerDocs.find((w) => w.name === name);
    if (!found) throw new Error(`seed: no worker ${name}`);
    return found._id;
  };

  // ---------- Assets (60) ----------
  const kinds = [
    { kind: 'drill', prefix: 'DRILL', count: 14, cert: null },
    { kind: 'grinder', prefix: 'GRND', count: 10, cert: null },
    { kind: 'ladder', prefix: 'LADR', count: 8, cert: null },
    { kind: 'harness', prefix: 'HARN', count: 14, cert: 'Working at Height' },
    { kind: 'gas-detector', prefix: 'GAS', count: 8, cert: 'Gas Safety' },
    { kind: 'generator', prefix: 'GEN', count: 6, cert: null },
  ];
  const assetSeed: {
    code: string;
    name: string;
    kind: string;
    requiresCertification: boolean;
    certificationName: string | null;
    outOfService: boolean;
    outOfServiceReason: string | null;
    heldBy: null;
  }[] = [];
  for (const k of kinds) {
    for (let i = 1; i <= k.count; i++) {
      const code = `${k.prefix}-${String(i).padStart(3, '0')}`;
      assetSeed.push({
        code,
        name: `${k.kind} ${code}`,
        kind: k.kind,
        requiresCertification: k.cert !== null,
        certificationName: k.cert,
        outOfService: code === 'GRND-003',
        outOfServiceReason:
          code === 'GRND-003' ? 'Guard cracked, pulled from service' : null,
        heldBy: null,
      });
    }
  }
  const assetDocs = await assets.insertMany(assetSeed);
  const A = (code: string): Types.ObjectId => {
    const found = assetDocs.find((a) => a.code === code);
    if (!found) throw new Error(`seed: no asset ${code}`);
    return found._id;
  };

  // ---------- Movements ----------
  // Issue an asset. If returnedAt is given, close it; otherwise it stays
  // outstanding and the asset keeps the holder.
  const issue = async (opts: {
    code: string;
    worker: string;
    issuedAt: Date;
    dueAt: Date;
    issueRecordedAt?: Date;
    returnedAt?: Date;
    returnRecordedAt?: Date;
    returnNote?: string;
  }) => {
    const assetId = A(opts.code);
    const workerId = W(opts.worker);
    const issueDoc = await movements.create({
      assetId,
      workerId,
      type: 'issue',
      occurredAt: opts.issuedAt,
      recordedAt: opts.issueRecordedAt ?? opts.issuedAt,
      dueAt: opts.dueAt,
      recordedBy: KEEPER,
      idempotencyKey: mvKey(),
    });
    if (opts.returnedAt) {
      await movements.create({
        assetId,
        workerId,
        type: 'return',
        occurredAt: opts.returnedAt,
        recordedAt: opts.returnRecordedAt ?? opts.returnedAt,
        closesMovementId: issueDoc._id,
        note: opts.returnNote ?? null,
        recordedBy: KEEPER,
        idempotencyKey: mvKey(),
      });
    } else {
      await assets.updateOne({ _id: assetId }, { $set: { heldBy: workerId } });
    }
    return issueDoc;
  };

  // Ordinary completed loops across the last 30 days.
  await issue({
    code: 'DRILL-001',
    worker: 'Ahmed Khan',
    issuedAt: at(daysAgo(28), 8),
    dueAt: at(daysAgo(26), 17),
    returnedAt: at(daysAgo(26), 14),
  });
  await issue({
    code: 'DRILL-002',
    worker: 'Bilal Toor',
    issuedAt: at(daysAgo(25), 9),
    dueAt: at(daysAgo(24), 17),
    returnedAt: at(daysAgo(24), 16),
  });
  await issue({
    code: 'LADR-001',
    worker: 'Carlos Diaz',
    issuedAt: at(daysAgo(22), 8),
    dueAt: at(daysAgo(20), 17),
    returnedAt: at(daysAgo(21), 11),
  });
  await issue({
    code: 'HARN-001',
    worker: 'Farhan Iqbal',
    issuedAt: at(daysAgo(20), 8),
    dueAt: at(daysAgo(19), 17),
    returnedAt: at(daysAgo(19), 15),
  });
  await issue({
    code: 'GAS-001',
    worker: 'Hassan Raza',
    issuedAt: at(daysAgo(18), 7),
    dueAt: at(daysAgo(17), 17),
    returnedAt: at(daysAgo(17), 17),
  });
  await issue({
    code: 'GRND-001',
    worker: 'Gohar Shah',
    issuedAt: at(daysAgo(15), 9),
    dueAt: at(daysAgo(14), 17),
    returnedAt: at(daysAgo(14), 13),
  });
  await issue({
    code: 'DRILL-004',
    worker: 'Kamran Butt',
    issuedAt: at(daysAgo(12), 8),
    dueAt: at(daysAgo(11), 17),
    returnedAt: at(daysAgo(11), 12),
  });
  await issue({
    code: 'GEN-002',
    worker: 'Junaid Akram',
    issuedAt: at(daysAgo(10), 8),
    dueAt: at(daysAgo(8), 17),
    returnedAt: at(daysAgo(8), 16),
  });

  // Late-logged: happened 09:00, typed in at 14:20 the same day.
  await issue({
    code: 'LADR-002',
    worker: 'Laiba Noor',
    issuedAt: at(daysAgo(9), 8),
    dueAt: at(daysAgo(8), 17),
    returnedAt: at(daysAgo(8), 9),
    returnRecordedAt: at(daysAgo(8), 14, 20),
    returnNote: 'Logged late - keeper was away from the hatch',
  });

  // Still outstanding.
  await issue({
    code: 'HARN-004',
    worker: 'Imran Malik',
    issuedAt: at(daysAgo(5), 8),
    dueAt: at(daysAhead(2), 17),
  });
  await issue({
    code: 'DRILL-006',
    worker: 'Bilal Toor',
    issuedAt: at(daysAgo(4), 9),
    dueAt: at(daysAhead(1), 17),
  });
  await issue({
    code: 'GEN-001',
    worker: 'Farhan Iqbal',
    issuedAt: at(daysAgo(3), 8),
    dueAt: at(daysAhead(4), 17),
  });

  // Outstanding AND overdue: due date already passed, still not back.
  await issue({
    code: 'DRILL-003',
    worker: 'Kamran Butt',
    issuedAt: at(daysAgo(7), 9),
    dueAt: at(daysAgo(2), 17),
  });

  // Correction: a return was logged at the wrong time, then fixed. History keeps
  // both rows; the original is marked superseded.
  const correctedIssue = await movements.create({
    assetId: A('HARN-005'),
    workerId: W('Ahmed Khan'),
    type: 'issue',
    occurredAt: at(daysAgo(9), 8),
    recordedAt: at(daysAgo(9), 8),
    dueAt: at(daysAgo(7), 17),
    recordedBy: KEEPER,
    idempotencyKey: mvKey(),
  });
  const wrongReturn = await movements.create({
    assetId: A('HARN-005'),
    workerId: W('Ahmed Khan'),
    type: 'return',
    occurredAt: at(daysAgo(7), 15),
    recordedAt: at(daysAgo(7), 15, 30),
    closesMovementId: correctedIssue._id,
    recordedBy: KEEPER,
    idempotencyKey: mvKey(),
  });
  const correction = await movements.create({
    assetId: A('HARN-005'),
    workerId: W('Ahmed Khan'),
    type: 'return',
    occurredAt: at(daysAgo(7), 9),
    recordedAt: at(daysAgo(6), 10),
    closesMovementId: correctedIssue._id,
    isCorrection: true,
    corrects: wrongReturn._id,
    note: 'Return actually happened at 09:00, not 15:00',
    recordedBy: KEEPER,
    idempotencyKey: mvKey(),
  });
  await movements.updateOne(
    { _id: wrongReturn._id },
    { $set: { supersededBy: correction._id } },
  );

  // ---------- Reservations ----------
  await reservations.insertMany([
    // future
    {
      assetId: A('GEN-003'),
      workerId: W('Farhan Iqbal'),
      windowStart: at(daysAhead(3), 8),
      windowEnd: at(daysAhead(3), 17),
      status: 'active',
      recordedBy: KEEPER,
      idempotencyKey: 'seed-res-0001',
    },
    {
      assetId: A('HARN-010'),
      workerId: W('Imran Malik'),
      windowStart: at(daysAhead(7), 8),
      windowEnd: at(daysAhead(9), 17),
      status: 'active',
      recordedBy: KEEPER,
      idempotencyKey: 'seed-res-0002',
    },
    // past, was collected
    {
      assetId: A('DRILL-001'),
      workerId: W('Ahmed Khan'),
      windowStart: at(daysAgo(28), 8),
      windowEnd: at(daysAgo(28), 17),
      status: 'collected',
      recordedBy: KEEPER,
      idempotencyKey: 'seed-res-0003',
    },
    // past, never collected - window ended, still active
    {
      assetId: A('GAS-004'),
      workerId: W('Hassan Raza'),
      windowStart: at(daysAgo(4), 8),
      windowEnd: at(daysAgo(4), 17),
      status: 'active',
      recordedBy: KEEPER,
      idempotencyKey: 'seed-res-0004',
    },
  ]);

  const [assetCount, workerCount, movementCount, reservationCount, held] =
    await Promise.all([
      assets.countDocuments(),
      workers.countDocuments(),
      movements.countDocuments(),
      reservations.countDocuments(),
      assets.countDocuments({ heldBy: { $ne: null } }),
    ]);
  console.log('Seed complete:');
  console.log(
    `  assets       ${assetCount} (${held} currently issued, 1 out of service)`,
  );
  console.log(`  workers      ${workerCount}`);
  console.log(`  movements    ${movementCount}`);
  console.log(`  reservations ${reservationCount}`);

  await app.close();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
