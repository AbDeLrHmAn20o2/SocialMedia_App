// @ts-nocheck
import { Types } from "mongoose";
import messageModel, {
  IMessage,
  MessageType,
  MessageStatus,
} from "../model/message.model.js";

export interface MessageQueryOptions {
  page?: number;
  limit?: number;
  populateSender?: boolean;
  populateConversation?: boolean;
  populateReplyTo?: boolean;
  messageType?: MessageType;
  status?: MessageStatus;
  beforeDate?: Date;
  afterDate?: Date;
  excludeDeletedFor?: string;
}

export class MessageRepository {
  private model = messageModel;

  // Create new message
  async create(messageData: Partial<IMessage>): Promise<IMessage> {
    const message = new this.model(messageData);
    return await message.save();
  }

  // Find message by ID
  async findById(
    id: string,
    options: MessageQueryOptions = {}
  ): Promise<IMessage | null> {
    const {
      populateSender = true,
      populateConversation = false,
      populateReplyTo = true,
    } = options;

    let query = this.model.findById(id);

    if (populateSender) {
      query = query.populate({
        path: "senderDetails",
        select: "fName lName email profilePicture",
      });
    }

    if (populateConversation) {
      query = query.populate({
        path: "conversationDetails",
        select: "name type participants",
      });
    }

    if (populateReplyTo) {
      query = query.populate({
        path: "replyToDetails",
        select: "content sender messageType createdAt",
        populate: {
          path: "sender",
          select: "fName lName",
        },
      });
    }

    return await query.exec();
  }

  // Get conversation messages with pagination
  async getConversationMessages(
    conversationId: string,
    userId: string,
    options: MessageQueryOptions = {}
  ): Promise<{
    data: IMessage[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const {
      page = 1,
      limit = 50,
      populateSender = true,
      populateReplyTo = true,
      beforeDate,
      afterDate,
      messageType,
    } = options;
    const skip = (page - 1) * limit;

    // Build query to exclude messages deleted for this user
    const query: any = {
      conversation: new Types.ObjectId(conversationId),
      isDeleted: false,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    };

    if (messageType) query.messageType = messageType;
    if (beforeDate) query.createdAt = { ...query.createdAt, $lt: beforeDate };
    if (afterDate) query.createdAt = { ...query.createdAt, $gt: afterDate };

    let mongoQuery = this.model.find(query);

    if (populateSender) {
      mongoQuery = mongoQuery.populate({
        path: "senderDetails",
        select: "fName lName email profilePicture",
      });
    }

    if (populateReplyTo) {
      mongoQuery = mongoQuery.populate({
        path: "replyToDetails",
        select: "content sender messageType createdAt",
        populate: {
          path: "sender",
          select: "fName lName",
        },
      });
    }

    const results = await mongoQuery
      .skip(skip)
      .limit(limit + 1) // Fetch one extra to check if there are more
      .sort({ createdAt: -1 })
      .exec();

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    const total = await this.model.countDocuments(query);

    return {
      data: data.reverse(), // Reverse to show oldest first
      total,
      page,
      limit,
      hasMore,
    };
  }

  // Update message
  async update(
    messageId: string,
    updateData: Partial<IMessage>
  ): Promise<IMessage | null> {
    return await this.model.findByIdAndUpdate(
      messageId,
      {
        ...updateData,
        isEdited: true,
        editedAt: new Date(),
      },
      { new: true }
    );
  }

  // Mark message as delivered
  async markAsDelivered(
    messageId: string,
    userId: string
  ): Promise<IMessage | null> {
    return await this.model.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { deliveredTo: new Types.ObjectId(userId) },
        status: MessageStatus.delivered,
      },
      { new: true }
    );
  }

  // Mark message as read
  async markAsRead(
    messageId: string,
    userId: string
  ): Promise<IMessage | null> {
    return await this.model.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { readBy: new Types.ObjectId(userId) },
        status: MessageStatus.read,
      },
      { new: true }
    );
  }

  // Mark all conversation messages as read
  async markConversationAsRead(
    conversationId: string,
    userId: string
  ): Promise<number> {
    const result = await this.model.updateMany(
      {
        conversation: new Types.ObjectId(conversationId),
        sender: { $ne: new Types.ObjectId(userId) },
        readBy: { $ne: new Types.ObjectId(userId) },
      },
      {
        $addToSet: { readBy: new Types.ObjectId(userId) },
        status: MessageStatus.read,
      }
    );

    return result.modifiedCount;
  }

  // Delete message for user (soft delete)
  async deleteForUser(
    messageId: string,
    userId: string
  ): Promise<IMessage | null> {
    return await this.model.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { deletedFor: new Types.ObjectId(userId) },
      },
      { new: true }
    );
  }

  // Delete message for everyone (hard delete)
  async deleteForEveryone(messageId: string): Promise<IMessage | null> {
    return await this.model.findByIdAndUpdate(
      messageId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        content: "This message was deleted",
      },
      { new: true }
    );
  }

  // Permanently delete message
  async permanentDelete(messageId: string): Promise<IMessage | null> {
    return await this.model.findByIdAndDelete(messageId);
  }

  // Get unread message count for user in a conversation
  async getUnreadCount(
    conversationId: string,
    userId: string
  ): Promise<number> {
    return await this.model.countDocuments({
      conversation: new Types.ObjectId(conversationId),
      sender: { $ne: new Types.ObjectId(userId) },
      readBy: { $ne: new Types.ObjectId(userId) },
      isDeleted: false,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    });
  }

  // Get total unread messages for user across all conversations
  async getTotalUnreadCount(userId: string): Promise<number> {
    return await this.model.countDocuments({
      sender: { $ne: new Types.ObjectId(userId) },
      readBy: { $ne: new Types.ObjectId(userId) },
      isDeleted: false,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    });
  }

  // Search messages in conversation
  async searchInConversation(
    conversationId: string,
    searchTerm: string,
    userId: string,
    options: MessageQueryOptions = {}
  ): Promise<{
    data: IMessage[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const query = {
      conversation: new Types.ObjectId(conversationId),
      content: { $regex: searchTerm, $options: "i" },
      isDeleted: false,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    };

    const results = await this.model
      .find(query)
      .populate({
        path: "senderDetails",
        select: "fName lName email profilePicture",
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .exec();

    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Get media messages in conversation
  async getMediaMessages(
    conversationId: string,
    userId: string,
    options: MessageQueryOptions = {}
  ): Promise<{
    data: IMessage[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, messageType } = options;
    const skip = (page - 1) * limit;

    const query: any = {
      conversation: new Types.ObjectId(conversationId),
      messageType: messageType || {
        $in: [
          MessageType.image,
          MessageType.video,
          MessageType.file,
          MessageType.audio,
        ],
      },
      isDeleted: false,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    };

    const results = await this.model
      .find(query)
      .populate({
        path: "senderDetails",
        select: "fName lName email profilePicture",
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .exec();

    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Get last message of conversation
  async getLastMessage(conversationId: string): Promise<IMessage | null> {
    return await this.model
      .findOne({
        conversation: new Types.ObjectId(conversationId),
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .populate({
        path: "senderDetails",
        select: "fName lName",
      })
      .exec();
  }

  // Delete all messages in conversation
  async deleteConversationMessages(conversationId: string): Promise<number> {
    const result = await this.model.deleteMany({
      conversation: new Types.ObjectId(conversationId),
    });

    return result.deletedCount;
  }
}
