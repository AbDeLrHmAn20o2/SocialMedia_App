import mongoose, { Types } from "mongoose";

export interface ILike {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  entityId: Types.ObjectId;
  entityType: string;
  createdAt: Date;
  updatedAt: Date;
}

const likeSchema = new mongoose.Schema<ILike>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    entityType: { type: String, required: true },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

likeSchema.index({ userId: 1, entityId: 1, entityType: 1 }, { unique: true });

const LikeModel =
  mongoose.models.Like || mongoose.model<ILike>("Like", likeSchema);

export default LikeModel;
