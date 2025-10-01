import mongoose, { Types } from "mongoose";

export enum PostStatus {
  draft = "draft",
  published = "published",
  archived = "archived",
  frozen = "frozen",
}

export enum PostAvailability {
  public = "public",
  private = "private",
  friends = "friends",
}

export interface IPost {
  _id: Types.ObjectId;
  title: string;
  content: string;
  author: Types.ObjectId;
  images?: string[];
  imageKeys?: string[]; // S3 keys for cleanup
  tags?: string[];
  status: PostStatus;
  availability: PostAvailability;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  viewsCount: number;

  // Moderation and freezing
  isFrozen: boolean;
  frozenAt?: Date;
  frozenBy?: Types.ObjectId;
  frozenReason?: string;
  frozenUntil?: Date;

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new mongoose.Schema<IPost>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minLength: 3,
      maxLength: 200,
    },
    content: {
      type: String,
      required: true,
      minLength: 10,
      maxLength: 5000,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    images: [{ type: String }], // URLs of uploaded images
    imageKeys: [{ type: String }], // S3 keys for deletion
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    status: {
      type: String,
      enum: Object.values(PostStatus),
      default: PostStatus.draft,
    },
    availability: {
      type: String,
      enum: Object.values(PostAvailability),
      default: PostAvailability.public,
    },
    likesCount: { type: Number, default: 0 },
    dislikesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },

    // Moderation and freezing
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date },
    frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    frozenReason: { type: String, trim: true },
    frozenUntil: { type: Date },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Virtual for author details
postSchema.virtual("authorDetails", {
  ref: "User",
  localField: "author",
  foreignField: "_id",
  justOne: true,
  select: "fName lName profilePicture email",
});

// Index for better performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ status: 1, availability: 1, isDeleted: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ createdAt: -1 });

// Pre-hook for soft delete - automatically delete associated images
postSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate() as any;

  if (update && update.isDeleted === true) {
    const post = await this.model.findOne(this.getQuery());

    if (post && post.imageKeys && post.imageKeys.length > 0) {
      // Import event emitter dynamically to avoid circular dependency
      const { evenEmitter } = await import("../../service/event.js");

      // Emit event to delete images
      evenEmitter.emit("deletePostImages", {
        imageKeys: post.imageKeys,
        bucket: process.env.AWS_BUCKET_NAME,
        postId: post._id,
      });
    }
  }
});

// Query middleware to exclude soft deleted posts by default
postSchema.pre(/^find/, function (this: any) {
  // Only exclude deleted posts if not explicitly including them
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

const postModel =
  mongoose.models.Post || mongoose.model<IPost>("Post", postSchema);

export default postModel;
