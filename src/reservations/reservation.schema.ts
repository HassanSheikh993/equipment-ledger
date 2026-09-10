import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

@Schema({ timestamps: true })
export class Reservation {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true })
  assetId: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true })
  workerId: Types.ObjectId;

  @Prop({ required: true })
  windowStart: Date;

  @Prop({ required: true })
  windowEnd: Date;

  @Prop({
    type: String,
    enum: ['active', 'collected', 'cancelled'],
    default: 'active',
  })
  status: string;

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ required: true })
  recordedBy: string;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

ReservationSchema.index({ assetId: 1, status: 1, windowStart: 1 });
