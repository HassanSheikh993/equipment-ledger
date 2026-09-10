import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export type AssetDocument = HydratedDocument<Asset>;

@Schema({ timestamps: true })
export class Asset {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  kind: string;

  @Prop({ default: false })
  requiresCertification: boolean;

  @Prop({ type: String, default: null })
  certificationName: string | null;

  @Prop({ default: false })
  outOfService: boolean;

  @Prop({ type: String, default: null })
  outOfServiceReason: string | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null })
  heldBy: Types.ObjectId | null;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
