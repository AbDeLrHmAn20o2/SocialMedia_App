import mongoose, { Types, Document } from "mongoose";

export enum FriendRequestStatus {
  pending = "pending",
  accepted = "accepted",
  rejected = "rejected",
  cancelled = "cancelled",
}

export interface IFriendRequest extends Document {
  _id: Types.ObjectId;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  status: FriendRequestStatus;
  message?: string;
  responseMessage?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  respondedAt?: Date;

  // Virtual fields
  senderDetails?: any;
  receiverDetails?: any;
}

const friendRequestSchema = new mongoose.Schema<IFriendRequest>(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(FriendRequestStatus),
      default: FriendRequestStatus.pending,
      index: true,
    },

    message: {
      type: String,
      trim: true,
      maxlength: [200, "Message cannot exceed 200 characters"],
    },

    responseMessage: {
      type: String,
      trim: true,
      maxlength: [200, "Response message cannot exceed 200 characters"],
    },

    respondedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for performance
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
friendRequestSchema.index({ receiver: 1, status: 1 });
friendRequestSchema.index({ sender: 1, status: 1 });
friendRequestSchema.index({ createdAt: -1 });

// Virtual for sender details
friendRequestSchema.virtual("senderDetails", {
  ref: "User",
  localField: "sender",
  foreignField: "_id",
  justOne: true,
});

// Virtual for receiver details
friendRequestSchema.virtual("receiverDetails", {
  ref: "User",
  localField: "receiver",
  foreignField: "_id",
  justOne: true,
});

// Ensure virtuals are included in JSON output
friendRequestSchema.set("toJSON", { virtuals: true });
friendRequestSchema.set("toObject", { virtuals: true });

// Pre-save middleware to set respondedAt when status changes
friendRequestSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status !== FriendRequestStatus.pending
  ) {
    this.respondedAt = new Date();
  }
  next();
});

const FriendRequest = mongoose.model<IFriendRequest>(
  "FriendRequest",
  friendRequestSchema
);

export default FriendRequest;
