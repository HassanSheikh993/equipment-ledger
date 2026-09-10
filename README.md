# Equipment Ledger — Backend

NestJS + MongoDB API for a construction-site tool store. Replaces the paper book: issue and return tools, reserve them for a future window, and reconstruct the whole store as it stood at any past instant.

The frontend is a **separate repository** (Next.js).

## 1. How to run

Needs MongoDB running locally.

```
npm install
npm run start:dev
```

API on `http://localhost:3000`. Connection string in `.env` (`MONGODB_URI`, defaults to `mongodb://localhost:27017/equipment-ledger`).

Frontend: see its own repo — `npm install` → `npm run dev`, opens `http://localhost:3001`, points at this API via `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`).

## 2. How to seed

```
npm run seed
```

Wipes the 4 collections and rebuilds a deterministic store: 60 assets, 12 workers, 30 days of movements (including one overdue, one late-logged, one correction) and past/future reservations. Safe to run repeatedly — it never doubles.

## 3. How to run the invariant checks

```
npm run check
```

Reads the database directly and asserts: every asset's current holder matches its last live movement, no return dated before its issue, no two overlapping active reservations, no duplicate idempotency keys. Prints PASS or FAIL.

## 4. The model, and why

Four collections: **Asset**, **Worker** (certifications embedded, no separate collection), **Reservation**, **Movement**.

The **Movement ledger is the source of truth.** Every issue and return is an append-only row that records `occurredAt` (when it happened) and `recordedAt` (when it was typed in) as separate fields. Asset stores only its fixed facts plus `outOfService` and one `heldBy` field. Current status, current holder, "overdue", and any point-in-time view are all computed from the movements, never stored (see §8).

A few smaller choices:

- **Certification boundary:** a cert is valid only if it expires *strictly after* the issue time — expiry on the day of issue is refused. All dates treated as UTC.
- **`@nestjs/mongoose` pinned to v11:** v12 is ESM-only and breaks Jest; v11 still supports Mongoose 9.

## 5. How concurrent issue was made impossible

One line:

```
assetModel.updateOne({ _id, heldBy: null }, { $set: { heldBy: workerId } })
```

MongoDB applies a single-document update atomically. Two issue requests racing for the same asset both run this; exactly one matches `heldBy: null` and wins, the other gets `matchedCount: 0` and is rejected. Return does the mirror (`{ _id, heldBy: holderId } → null`).

**Cost:** `heldBy` is a small bit of denormalised state, so `npm run check` verifies it always agrees with the ledger.

Reservations can't use this trick (overlap isn't a single-field match), so they pre-check, insert, then re-check for an older overlapping row and roll their own row back if found — deterministic, one survivor.

## 6. What I'd do with another day

- Remember the storekeeper once instead of picking them on every form.
- Pagination on the asset list and history.
- Auto-expiry of reservations (a past uncollected one currently stays "active").
- Run the reservation / one-holder logic inside a MongoDB transaction instead of compensating rollbacks.

## 7. What I knowingly left out

Everything in the brief is implemented. The trade-offs made:

- **No DB transactions** — standalone Mongo, so atomic single-document updates plus compensating rollback instead (see §5). A real transaction would make the movement-write + asset-update all-or-nothing; without it, a crash in the gap could leave `heldBy` set with no movement behind it — which `npm run check` catches, and which a replica set + transactions would remove entirely.
- Out of scope per the brief, not built: auth, roles, email, file uploads, barcode scanning, multi-site.
- Correcting a movement changes only its time and note, not the worker or asset.

## 8. Why asset status is derived, not stored

The brief wants "who held what at 14:20 last Tuesday" answered from the ledger, not a cache. A stored status field would drift the moment someone makes a correction or logs an entry late. So status, holder and "overdue" are recomputed from the movements every time. The `heldBy` field exists only as the concurrency lock (§5), and `npm run check` proves it never disagrees with the ledger. Every screen and the "as of" query stay consistent because they're the same computation.

## 9. Decision: out-of-service asset with standing reservations

We don't touch the reservations. Marking an asset out of service just flips a flag. Issue and Reserve both refuse an out-of-service asset with a readable reason, so a standing reservation simply becomes uncollectable — and the storekeeper sees a clear "GRND-003 is out of service: cracked guard" when the worker turns up, rather than a silent cancellation the worker never hears about. A "back in service" endpoint undoes it.

## API

| Method | Route | |
|---|---|---|
| `GET` | `/assets` | list, current holder populated (`?kind=` filter) |
| `POST` | `/assets` | create |
| `PATCH` | `/assets/:id/out-of-service` | `{ reason }` |
| `PATCH` | `/assets/:id/back-in-service` | |
| `GET` | `/workers` | list |
| `POST` | `/workers` | create |
| `POST` | `/movements/issue` | hand a tool to a worker |
| `POST` | `/movements/return` | take it back (`damaged` → out of service) |
| `POST` | `/movements/:id/correct` | fix a movement's time/note, keeping history |
| `POST` | `/reservations` | book a future window |
| `GET` | `/reservations` | list (`?assetId=` `?workerId=` `?status=`) |
| `PATCH` | `/reservations/:id/cancel` | |
| `GET` | `/reconstruct/as-of?at=<ISO>` | the whole store at a past instant |
| `GET` | `/reconstruct/assets/:id` | one asset's full history + reservations |

## Tests

```
npm test
```

Currently smoke tests (each module wires up). The behaviour proof is `npm run check` against a seeded or exercised database.
