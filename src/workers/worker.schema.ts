import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkerDocument = HydratedDocument<Worker>;

// Certification is nested inside Worker
// No separate collection needed
class Certification {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  expiryDate: Date;
}

@Schema({ timestamps: true })
export class Worker {

  @Prop({ required: true })
  name: string;

  @Prop({ type: [Certification], default: [] })
  certifications: Certification[];

}

export const WorkerSchema = SchemaFactory.createForClass(Worker);