import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as mongoose from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

@Schema({ timestamps: true })
export class Reservation {

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true })
  assetId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true })
  workerId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true })
  windowStart: Date;

  @Prop({ required: true })
  windowEnd: Date;

  @Prop({
    type: String,
    enum: ['active', 'collected', 'cancelled', 'expired'],
    default: 'active',
  })
  status: string;

  @Prop({ required: true, unique: true })
  idempotencyKey: string; // double-click must not create two reservations

}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

// Overlap check ("may not share a minute") is done in the service inside a
// transaction against active reservations for the same asset - a plain index
// can't express range non-overlap. This index keeps that check cheap.
ReservationSchema.index({ assetId: 1, status: 1, windowStart: 1 });
