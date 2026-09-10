import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Asset } from './asset.schema';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

@Injectable()
export class AssetsService {
  constructor(@InjectModel(Asset.name) private assetModel: Model<Asset>) {}

  // heldBy is the live concurrency guard, so it is the accurate current holder.
  list(dto: ListAssetsDto) {
    const filter: Record<string, unknown> = {};
    if (dto.kind) filter.kind = dto.kind;
    return this.assetModel.find(filter).sort({ code: 1 }).populate('heldBy');
  }

  async create(dto: CreateAssetDto) {
    try {
      return await this.assetModel.create({
        code: dto.code,
        name: dto.name,
        kind: dto.kind,
        requiresCertification: dto.requiresCertification ?? false,
        certificationName: dto.certificationName ?? null,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(`Asset code ${dto.code} already exists`);
      }
      throw err;
    }
  }

  async markOutOfService(id: string, reason: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Asset not found');
    }
    // Allowed while issued or reserved - it just can't be issued/reserved again.
    const asset = await this.assetModel.findOneAndUpdate(
      { _id: id, outOfService: false },
      { $set: { outOfService: true, outOfServiceReason: reason } },
      { new: true },
    );
    if (asset) return asset;

    const exists = await this.assetModel.exists({ _id: id });
    if (!exists) throw new NotFoundException('Asset not found');
    throw new ConflictException('Asset is already out of service');
  }
}
