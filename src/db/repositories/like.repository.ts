import { dbRepository } from "./db.repositories.js";
import { Model, Types } from "mongoose";
import { ILike } from "../model/like.model.js";

export class LikeRepository extends dbRepository<ILike> {
  constructor(protected readonly model: Model<ILike>) {
    super(model);
  }

  async toggleLike(userId: string, entityId: string, entityType: string) {
    const existingLike = await this.findOne({
      userId: new Types.ObjectId(userId),
      entityId: new Types.ObjectId(entityId),
      entityType,
    });

    if (existingLike) {
      await this.model.deleteOne({ _id: existingLike._id });
      return { action: "unliked", liked: false };
    } else {
      await this.create({
        userId: new Types.ObjectId(userId),
        entityId: new Types.ObjectId(entityId),
        entityType,
      });
      return { action: "liked", liked: true };
    }
  }

  async countLikes(entityId: string, entityType: string) {
    return await this.model.countDocuments({
      entityId: new Types.ObjectId(entityId),
      entityType,
    });
  }

  async isLikedByUser(userId: string, entityId: string, entityType: string) {
    const like = await this.findOne({
      userId: new Types.ObjectId(userId),
      entityId: new Types.ObjectId(entityId),
      entityType,
    });
    return !!like;
  }
}
