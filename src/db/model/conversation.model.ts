import mongoose, { Types, Document } from "mongoose";

export enum ConversationType {
  oneToOne = "oneToOne",
  group = "group",
}

export interface IConversation extends Document {
  _id: Types.ObjectId;
  type: ConversationType;

  // For one-on-one chats
  participants: Types.ObjectId[];

  // For group chats
  name?: string;
  description?: string;
  admin: Types.ObjectId[];

  // Last message info for preview
  lastMessage?: {
    content: string;
    sender: Types.ObjectId;
    sentAt: Date;
    messageType: string;
  };

  // Settings
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  participantDetails?: any[];
  adminDetails?: any[];
}

const conversationSchema = new mongoose.Schema<IConversation>(
  {
    type: {
      type: String,
      enum: Object.values(ConversationType),
      required: true,
      default: ConversationType.oneToOne,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    name: {
      type: String,
      trim: true,
      maxlength: [100, "Group name cannot exceed 100 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },

    admin: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    lastMessage: {
      content: { type: String },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      sentAt: { type: Date },
      messageType: { type: String },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ type: 1 });
conversationSchema.index({ "lastMessage.sentAt": -1 });
conversationSchema.index({ createdAt: -1 });

// Compound index for one-on-one chat lookup
conversationSchema.index({ type: 1, participants: 1 });

// Virtual for participant details
conversationSchema.virtual("participantDetails", {
  ref: "User",
  localField: "participants",
  foreignField: "_id",
  justOne: false,
});

// Virtual for admin details
conversationSchema.virtual("adminDetails", {
  ref: "User",
  localField: "admin",
  foreignField: "_id",
  justOne: false,
});

// Ensure virtuals are included in JSON output
conversationSchema.set("toJSON", { virtuals: true });
conversationSchema.set("toObject", { virtuals: true });

// Validate participants based on conversation type
conversationSchema.pre("save", function (next) {
  if (
    this.type === ConversationType.oneToOne &&
    this.participants.length !== 2
  ) {
    return next(
      new Error("One-to-one conversation must have exactly 2 participants")
    );
  }

  if (this.type === ConversationType.group && this.participants.length < 2) {
    return next(
      new Error("Group conversation must have at least 2 participants")
    );
  }

  // Set first participant as admin for group chats if no admin specified
  if (
    this.type === ConversationType.group &&
    this.admin.length === 0 &&
    this.participants.length > 0
  ) {
    const firstParticipant = this.participants[0];
    if (firstParticipant) {
      this.admin = [firstParticipant];
    }
  }

  next();
});

const conversationModel =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", conversationSchema);

export default conversationModel;
