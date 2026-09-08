import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as mongoose from 'mongoose';

export type AssetDocument = HydratedDocument<Asset>;

@Schema({ timestamps: true })
export class Asset {

  @Prop({ required: true, unique: true })
  code: string; // e.g. HARN-014

  @Prop({ required: true })
  name: string; // e.g. Safety Harness

  @Prop({ required: true })
  kind: string; // e.g. harness, drill, gas-detector

  @Prop({ default: false })
  requiresCertification: boolean;

  @Prop({ default: null })
  certificationName: string; // null if requiresCertification is false

  // Out of service is a real asset property (not derivable from issue/return
  // movements). "as of" reconstruction is about holders, so a boolean is enough.
  @Prop({ default: false })
  outOfService: boolean;

  @Prop({ default: null })
  outOfServiceReason: string;

  // Concurrency guard ONLY. This is the line that makes double-issue impossible:
  // issue does updateOne({ _id, heldBy: null }, { $set: { heldBy } }) - exactly
  // one concurrent request matches and wins. Status / holder shown on screen and
  // all history are DERIVED from the movements ledger, not from this field.
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null })
  heldBy: mongoose.Schema.Types.ObjectId;

}

export const AssetSchema = SchemaFactory.createForClass(Asset);
