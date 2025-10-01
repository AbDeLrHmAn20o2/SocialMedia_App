import mongoose, { Types } from "mongoose";

export enum ReactionType {
  like = "like",
  dislike = "dislike",
}

export interface IPostReaction {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  post: Types.ObjectId;
  reactionType: ReactionType;
  createdAt: Date;
  updatedAt: Date;
}

const postReactionSchema = new mongoose.Schema<IPostReaction>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    reactionType: {
      type: String,
      enum: Object.values(ReactionType),
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one reaction per user per post
postReactionSchema.index({ user: 1, post: 1 }, { unique: true });

// Index for counting reactions
postReactionSchema.index({ post: 1, reactionType: 1 });

const postReactionModel =
  mongoose.models.PostReaction ||
  mongoose.model<IPostReaction>("PostReaction", postReactionSchema);

export default postReactionModel;
