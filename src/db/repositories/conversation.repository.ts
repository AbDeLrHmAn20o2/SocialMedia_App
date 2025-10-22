// @ts-nocheck
import { Types } from "mongoose";
import conversationModel, {
  IConversation,
  ConversationType,
} from "../model/conversation.model.js";

export interface ConversationQueryOptions {
  page?: number;
  limit?: number;
  populateParticipants?: boolean;
  populateAdmins?: boolean;
  populateLastMessage?: boolean;
  userId?: string;
  type?: ConversationType;
  isActive?: boolean;
}

export class ConversationRepository {
  private model = conversationModel;

  // Create new conversation
  async create(
    conversationData: Partial<IConversation>
  ): Promise<IConversation> {
    const conversation = new this.model(conversationData);
    return await conversation.save();
  }

  // Find conversation by ID
  async findById(
    id: string,
    options: ConversationQueryOptions = {}
  ): Promise<IConversation | null> {
    const { populateParticipants = true, populateAdmins = true } = options;

    let query = this.model.findById(id);

    if (populateParticipants) {
      query = query.populate({
        path: "participantDetails",
        select: "fName lName email profilePicture isVerified",
      });
    }

    if (populateAdmins) {
      query = query.populate({
        path: "adminDetails",
        select: "fName lName email profilePicture",
      });
    }

    return await query.exec();
  }

  // Find one-on-one conversation between two users
  async findOneToOneConversation(
    user1Id: string,
    user2Id: string
  ): Promise<IConversation | null> {
    return await this.model.findOne({
      type: ConversationType.oneToOne,
      participants: {
        $all: [new Types.ObjectId(user1Id), new Types.ObjectId(user2Id)],
      },
    });
  }

  // Get all conversations for a user
  async getUserConversations(
    userId: string,
    options: ConversationQueryOptions = {}
  ): Promise<{
    data: IConversation[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      populateParticipants = true,
      type,
      isActive = true,
    } = options;
    const skip = (page - 1) * limit;

    const query: any = {
      participants: new Types.ObjectId(userId),
      isActive,
    };

    if (type) query.type = type;

    let mongoQuery = this.model.find(query);

    if (populateParticipants) {
      mongoQuery = mongoQuery.populate({
        path: "participantDetails",
        select: "fName lName email profilePicture isVerified",
      });
    }

    const results = await mongoQuery
      .skip(skip)
      .limit(limit)
      .sort({ "lastMessage.sentAt": -1, updatedAt: -1 })
      .exec();

    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Add participant to group conversation
  async addParticipant(
    conversationId: string,
    userId: string
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { participants: new Types.ObjectId(userId) },
      },
      { new: true }
    );
  }

  // Remove participant from group conversation
  async removeParticipant(
    conversationId: string,
    userId: string
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      {
        $pull: { participants: new Types.ObjectId(userId) },
      },
      { new: true }
    );
  }

  // Add admin to group conversation
  async addAdmin(
    conversationId: string,
    userId: string
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { admin: new Types.ObjectId(userId) },
      },
      { new: true }
    );
  }

  // Remove admin from group conversation
  async removeAdmin(
    conversationId: string,
    userId: string
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      {
        $pull: { admin: new Types.ObjectId(userId) },
      },
      { new: true }
    );
  }

  // Update conversation details
  async update(
    conversationId: string,
    updateData: Partial<IConversation>
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(conversationId, updateData, {
      new: true,
    });
  }

  // Update last message
  async updateLastMessage(
    conversationId: string,
    lastMessage: {
      content: string;
      sender: Types.ObjectId;
      sentAt: Date;
      messageType: string;
    }
  ): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      { lastMessage },
      { new: true }
    );
  }

  // Deactivate conversation
  async deactivate(conversationId: string): Promise<IConversation | null> {
    return await this.model.findByIdAndUpdate(
      conversationId,
      { isActive: false },
      { new: true }
    );
  }

  // Delete conversation
  async deleteById(conversationId: string): Promise<IConversation | null> {
    return await this.model.findByIdAndDelete(conversationId);
  }

  // Check if user is participant
  async isParticipant(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    const conversation = await this.model.findOne({
      _id: new Types.ObjectId(conversationId),
      participants: new Types.ObjectId(userId),
    });
    return !!conversation;
  }

  // Check if user is admin
  async isAdmin(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.model.findOne({
      _id: new Types.ObjectId(conversationId),
      admin: new Types.ObjectId(userId),
    });
    return !!conversation;
  }

  // Search conversations
  async searchConversations(
    userId: string,
    searchTerm: string,
    options: ConversationQueryOptions = {}
  ): Promise<{
    data: IConversation[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const query: any = {
      participants: new Types.ObjectId(userId),
      isActive: true,
      $or: [
        { name: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
      ],
    };

    const results = await this.model
      .find(query)
      .populate({
        path: "participantDetails",
        select: "fName lName email profilePicture",
      })
      .skip(skip)
      .limit(limit)
      .sort({ "lastMessage.sentAt": -1 })
      .exec();

    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Get group conversations where user is admin
  async getUserAdminGroups(
    userId: string,
    options: ConversationQueryOptions = {}
  ): Promise<{
    data: IConversation[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const query = {
      type: ConversationType.group,
      admin: new Types.ObjectId(userId),
      isActive: true,
    };

    const results = await this.model
      .find(query)
      .populate({
        path: "participantDetails",
        select: "fName lName email profilePicture",
      })
      .skip(skip)
      .limit(limit)
      .sort({ updatedAt: -1 })
      .exec();

    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }
}
