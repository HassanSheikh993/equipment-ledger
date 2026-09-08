import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as mongoose from 'mongoose';

export type MovementDocument = HydratedDocument<Movement>;

@Schema({ timestamps: true })
export class Movement {

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true })
  assetId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true })
  workerId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: String, enum: ['issue', 'return'], required: true })
  type: string;

  @Prop({ required: true })
  occurredAt: Date; // when it ACTUALLY happened e.g. 09:00

  @Prop({ required: true })
  recordedAt: Date; // when it was WRITTEN in system e.g. 11:40

  @Prop({ default: null })
  dueAt: Date; // issue only: expected return time. "overdue" = now > dueAt and not yet returned (derived)

  // return only: which issue movement this return closes. Lets us reject a
  // return backdated before its issue, or into the middle of a later movement.
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Movement', default: null })
  closesMovementId: mongoose.Schema.Types.ObjectId;

  @Prop({ default: false })
  isCorrection: boolean;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Movement', default: null })
  corrects: mongoose.Schema.Types.ObjectId; // which movement this corrects

  // set on the ORIGINAL movement when a correction is written. Reconstruction
  // queries filter { supersededBy: null } - history still shows both rows.
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Movement', default: null })
  supersededBy: mongoose.Schema.Types.ObjectId;

  @Prop({ default: null })
  note: string; // human-readable reason (refusal, damage, correction)

  @Prop({ default: null })
  recordedBy: string; // store keeper name (picked from a list, no auth)

  @Prop({ required: true, unique: true })
  idempotencyKey: string; // prevents double submissions

}

export const MovementSchema = SchemaFactory.createForClass(Movement);

// Fast reconstruction: full life of one asset, and "as of" scans.
MovementSchema.index({ assetId: 1, occurredAt: 1 });
