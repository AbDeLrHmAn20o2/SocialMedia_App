import mongoose, { Types, Document } from "mongoose";
import { evenEmitter } from "../../service/event.js";

export enum CommentType {
  post = "post",
  comment = "comment",
}

export enum CommentStatus {
  active = "active",
  hidden = "hidden",
  deleted = "deleted",
  frozen = "frozen",
}

export interface IComment extends Document {
  _id: Types.ObjectId;
  content: string;
  author: Types.ObjectId;

  // RefPath pattern for polymorphic relationships
  commentOn: Types.ObjectId; // Can reference Post or Comment
  commentOnModel: CommentType; // Discriminator for refPath

  // Nested comment support
  parentComment?: Types.ObjectId;
  rootComment?: Types.ObjectId | null; // Top-level comment for deep nesting
  depth: number; // Nesting level (0 = root comment)

  // Engagement metrics
  likesCount: number;
  dislikesCount: number;
  repliesCount: number; // Number of direct replies
  totalRepliesCount: number; // Total replies including nested

  // Moderation
  status: CommentStatus;
  isEdited: boolean;
  editedAt?: Date;

  // Freezing
  isFrozen: boolean;
  frozenAt?: Date;
  frozenBy?: Types.ObjectId;
  frozenReason?: string;
  frozenUntil?: Date;

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  replies?: IComment[];
  nestedReplies?: IComment[];
  authorDetails?: any;
  commentOnDetails?: any;
}

const commentSchema = new mongoose.Schema<IComment>(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, "Comment cannot exceed 2000 characters"],
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // RefPath for polymorphic relationships
    commentOn: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    commentOnModel: {
      type: String,
      required: true,
      enum: Object.values(CommentType),
      index: true,
    },

    // Nested comment structure
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },

    rootComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },

    depth: {
      type: Number,
      default: 0,
      min: 0,
      max: 10, // Limit nesting depth
      index: true,
    },

    // Engagement metrics
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dislikesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    repliesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalRepliesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Moderation
    status: {
      type: String,
      enum: Object.values(CommentStatus),
      default: CommentStatus.active,
      index: true,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },

    // Freezing
    isFrozen: {
      type: Boolean,
      default: false,
    },

    frozenAt: {
      type: Date,
    },

    frozenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    frozenReason: {
      type: String,
      trim: true,
    },

    frozenUntil: {
      type: Date,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for performance
commentSchema.index({ commentOn: 1, commentOnModel: 1, isDeleted: 1 });
commentSchema.index({ parentComment: 1, isDeleted: 1, createdAt: -1 });
commentSchema.index({ rootComment: 1, depth: 1, createdAt: -1 });
commentSchema.index({ author: 1, isDeleted: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1, isDeleted: 1 });

// Virtual for polymorphic population using refPath
commentSchema.virtual("commentOnDetails", {
  ref: function (doc: IComment) {
    return doc.commentOnModel === CommentType.post ? "Post" : "Comment";
  },
  localField: "commentOn",
  foreignField: "_id",
  justOne: true,
});

// Virtual for author details
commentSchema.virtual("authorDetails", {
  ref: "User",
  localField: "author",
  foreignField: "_id",
  justOne: true,
});

// Virtual for direct replies
commentSchema.virtual("replies", {
  ref: "Comment",
  localField: "_id",
  foreignField: "parentComment",
  match: { isDeleted: false, status: CommentStatus.active },
  options: { sort: { createdAt: 1 } },
});

// Virtual for nested replies (all descendants)
commentSchema.virtual("nestedReplies", {
  ref: "Comment",
  localField: "_id",
  foreignField: "rootComment",
  match: { isDeleted: false, status: CommentStatus.active },
  options: { sort: { createdAt: 1 } },
});

// Pre-save middleware to set rootComment and handle nesting
commentSchema.pre("save", async function (next) {
  if (this.isNew) {
    if (this.parentComment) {
      // This is a reply to another comment
      const parentComment = await mongoose
        .model("Comment")
        .findById(this.parentComment);
      if (parentComment) {
        this.depth = parentComment.depth + 1;
        this.rootComment = parentComment.rootComment || parentComment._id;

        // Enforce maximum nesting depth
        if (this.depth > 10) {
          const error = new Error("Maximum comment nesting depth exceeded");
          return next(error);
        }
      }
    } else {
      // This is a root comment
      this.depth = 0;
      this.rootComment = null;
    }
  }
  next();
});

// Post-save middleware to update parent comment counters
commentSchema.post("save", async function (doc: IComment) {
  if (doc.parentComment && !doc.isDeleted) {
    // Update direct parent's reply count
    await mongoose
      .model("Comment")
      .findByIdAndUpdate(doc.parentComment, { $inc: { repliesCount: 1 } });

    // Update root comment's total reply count
    if (doc.rootComment) {
      await mongoose
        .model("Comment")
        .findByIdAndUpdate(doc.rootComment, { $inc: { totalRepliesCount: 1 } });
    }
  }

  // Update post's comment count if this is a direct comment on a post
  if (
    doc.commentOnModel === CommentType.post &&
    !doc.parentComment &&
    !doc.isDeleted
  ) {
    await mongoose
      .model("Post")
      .findByIdAndUpdate(doc.commentOn, { $inc: { commentsCount: 1 } });
  }
});

// Pre-remove middleware for soft delete cleanup
commentSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() as any;

  // Handle soft delete
  if (update.$set && update.$set.isDeleted === true) {
    const comment = await this.model.findOne(this.getQuery());
    if (comment) {
      // Emit event for cleanup if needed
      evenEmitter.emit("commentDeleted", {
        commentId: comment._id,
        authorId: comment.author,
        commentOn: comment.commentOn,
        commentOnModel: comment.commentOnModel,
      });

      // Update counters
      if (comment.parentComment) {
        await mongoose
          .model("Comment")
          .findByIdAndUpdate(comment.parentComment, {
            $inc: { repliesCount: -1 },
          });
      }

      if (comment.rootComment) {
        await mongoose.model("Comment").findByIdAndUpdate(comment.rootComment, {
          $inc: { totalRepliesCount: -1 },
        });
      }

      if (
        comment.commentOnModel === CommentType.post &&
        !comment.parentComment
      ) {
        await mongoose.model("Post").findByIdAndUpdate(comment.commentOn, {
          $inc: { commentsCount: -1 },
        });
      }
    }
  }

  next();
});

// Query middleware to exclude deleted comments by default
commentSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().isDeleted) {
    query.find({ isDeleted: { $ne: true } });
  }
  next();
});

// Ensure virtuals are included in JSON output
commentSchema.set("toJSON", { virtuals: true });
commentSchema.set("toObject", { virtuals: true });

const Comment = mongoose.model<IComment>("Comment", commentSchema);

export default Comment;
