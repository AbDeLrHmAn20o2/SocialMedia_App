import mongoose, { Types } from "mongoose";


export interface IRevokeToken {
userId: Types.ObjectId,
tokenId: string,
expireAt: Date,
  createdAt: Date;
  updatedAt: Date;
}

const RevokeTokenSchema = new mongoose.Schema<IRevokeToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenId: { type: String, required: true },
    expireAt: { type: Date, required: true },
  },{
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);
const RevokeTokenModel =
  mongoose.models.RevokeToken || mongoose.model<IRevokeToken>("RevokeToken", RevokeTokenSchema);

export default RevokeTokenModel;
