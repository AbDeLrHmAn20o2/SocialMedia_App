import mongoose, { Types, Document } from "mongoose";

export enum MessageType {
  text = "text",
  image = "image",
  video = "video",
  file = "file",
  audio = "audio",
  location = "location",
}

export enum MessageStatus {
  sent = "sent",
  delivered = "delivered",
  read = "read",
  failed = "failed",
}

export interface IMessage extends Document {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;

  // Content
  content: string;
  messageType: MessageType;

  // File information (for non-text messages)
  fileUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;

  // Location data
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };

  // Status tracking
  status: MessageStatus;
  deliveredTo: Types.ObjectId[];
  readBy: Types.ObjectId[];

  // Reply/Forward
  replyTo?: Types.ObjectId;
  isForwarded: boolean;

  // Metadata
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedFor: Types.ObjectId[]; // Users who deleted this message (for them)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  senderDetails?: any;
  conversationDetails?: any;
  replyToDetails?: any;
}

const messageSchema = new mongoose.Schema<IMessage>(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [10000, "Message content cannot exceed 10000 characters"],
    },

    messageType: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
      default: MessageType.text,
    },

    // File information
    fileUrl: {
      type: String,
      trim: true,
    },

    fileKey: {
      type: String,
      trim: true,
    },

    fileName: {
      type: String,
      trim: true,
    },

    fileSize: {
      type: Number,
      min: 0,
    },

    mimeType: {
      type: String,
      trim: true,
    },

    // Location
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String, trim: true },
    },

    // Status
    status: {
      type: String,
      enum: Object.values(MessageStatus),
      default: MessageStatus.sent,
      index: true,
    },

    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Reply/Forward
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },

    isForwarded: {
      type: Boolean,
      default: false,
    },

    // Metadata
    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
    },

    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for performance
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ conversation: 1, isDeleted: 1, createdAt: -1 });

// Virtual for sender details
messageSchema.virtual("senderDetails", {
  ref: "User",
  localField: "sender",
  foreignField: "_id",
  justOne: true,
});

// Virtual for conversation details
messageSchema.virtual("conversationDetails", {
  ref: "Conversation",
  localField: "conversation",
  foreignField: "_id",
  justOne: true,
});

// Virtual for reply message details
messageSchema.virtual("replyToDetails", {
  ref: "Message",
  localField: "replyTo",
  foreignField: "_id",
  justOne: true,
});

// Ensure virtuals are included in JSON output
messageSchema.set("toJSON", { virtuals: true });
messageSchema.set("toObject", { virtuals: true });

// Validate file fields based on message type
messageSchema.pre("save", function (next) {
  if (this.messageType !== MessageType.text && !this.fileUrl) {
    return next(
      new Error(`File URL is required for ${this.messageType} messages`)
    );
  }
  next();
});

// Update conversation's last message
messageSchema.post("save", async function () {
  try {
    const Conversation = mongoose.model("Conversation");
    await Conversation.findByIdAndUpdate(this.conversation, {
      lastMessage: {
        content: this.content,
        sender: this.sender,
        sentAt: this.createdAt,
        messageType: this.messageType,
      },
    });
  } catch (error) {
    console.error("Error updating conversation last message:", error);
  }
});

const messageModel =
  mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

export default messageModel;
