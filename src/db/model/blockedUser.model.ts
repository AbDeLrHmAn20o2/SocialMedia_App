import mongoose, { Types, Document } from "mongoose";

export interface IBlockedUser extends Document {
  _id: Types.ObjectId;
  blocker: Types.ObjectId; // User who blocked
  blocked: Types.ObjectId; // User who was blocked
  reason?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  blockerDetails?: any;
  blockedDetails?: any;
}

const blockedUserSchema = new mongoose.Schema<IBlockedUser>(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: [500, "Reason cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for performance
blockedUserSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockedUserSchema.index({ blocked: 1 });
blockedUserSchema.index({ createdAt: -1 });

// Virtual for blocker details
blockedUserSchema.virtual("blockerDetails", {
  ref: "User",
  localField: "blocker",
  foreignField: "_id",
  justOne: true,
});

// Virtual for blocked user details
blockedUserSchema.virtual("blockedDetails", {
  ref: "User",
  localField: "blocked",
  foreignField: "_id",
  justOne: true,
});

// Ensure virtuals are included in JSON output
blockedUserSchema.set("toJSON", { virtuals: true });
blockedUserSchema.set("toObject", { virtuals: true });

const BlockedUser = mongoose.model<IBlockedUser>(
  "BlockedUser",
  blockedUserSchema
);

export default BlockedUser;
