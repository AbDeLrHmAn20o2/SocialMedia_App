import FriendRequest, {
  IFriendRequest,
  FriendRequestStatus,
} from "../model/friendRequest.model.js";
import { Types } from "mongoose";

export interface FriendRequestQueryOptions {
  page?: number;
  limit?: number;
  status?: FriendRequestStatus;
  populateSender?: boolean;
  populateReceiver?: boolean;
}

export class FriendRequestRepository {
  private model = FriendRequest;

  // Send friend request
  async create(requestData: Partial<IFriendRequest>): Promise<IFriendRequest> {
    const friendRequest = new this.model(requestData);
    return await friendRequest.save();
  }

  // Find friend request by ID
  async findById(id: string): Promise<IFriendRequest | null> {
    return await this.model.findById(id);
  }

  // Find existing friend request between two users
  async findBetweenUsers(
    senderId: string,
    receiverId: string
  ): Promise<IFriendRequest | null> {
    return await this.model.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    });
  }

  // Get pending friend requests for a user
  async getPendingRequests(
    userId: string,
    options: FriendRequestQueryOptions = {}
  ): Promise<{
    data: IFriendRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      populateSender = true,
      populateReceiver = true,
    } = options;
    const skip = (page - 1) * limit;

    let query = this.model.find({
      receiver: new Types.ObjectId(userId),
      status: FriendRequestStatus.pending,
    });

    if (populateSender) {
      query = query.populate({
        path: "senderDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    if (populateReceiver) {
      query = query.populate({
        path: "receiverDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    const results = await query.skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await this.model.countDocuments({
      receiver: new Types.ObjectId(userId),
      status: FriendRequestStatus.pending,
    });

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Get sent friend requests for a user
  async getSentRequests(
    userId: string,
    options: FriendRequestQueryOptions = {}
  ): Promise<{
    data: IFriendRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, status, populateReceiver = true } = options;
    const skip = (page - 1) * limit;

    const query: any = { sender: new Types.ObjectId(userId) };
    if (status) query.status = status;

    let mongoQuery = this.model.find(query);

    if (populateReceiver) {
      mongoQuery = mongoQuery.populate({
        path: "receiverDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    const results = await mongoQuery
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    const total = await this.model.countDocuments(query);

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Update friend request status
  async updateStatus(
    id: string,
    status: FriendRequestStatus,
    responseMessage?: string
  ): Promise<IFriendRequest | null> {
    const updateData: any = { status };
    if (responseMessage) updateData.responseMessage = responseMessage;

    return await this.model.findByIdAndUpdate(id, updateData, { new: true });
  }

  // Delete friend request
  async deleteById(id: string): Promise<IFriendRequest | null> {
    return await this.model.findByIdAndDelete(id);
  }

  // Check if users are friends (accepted friend request exists)
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const friendRequest = await this.model.findOne({
      $or: [
        {
          sender: userId1,
          receiver: userId2,
          status: FriendRequestStatus.accepted,
        },
        {
          sender: userId2,
          receiver: userId1,
          status: FriendRequestStatus.accepted,
        },
      ],
    });
    return !!friendRequest;
  }

  // Get all friends for a user
  async getFriends(
    userId: string,
    options: FriendRequestQueryOptions = {}
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const friendRequests = await this.model
      .find({
        $or: [
          {
            sender: new Types.ObjectId(userId),
            status: FriendRequestStatus.accepted,
          },
          {
            receiver: new Types.ObjectId(userId),
            status: FriendRequestStatus.accepted,
          },
        ],
      })
      .populate({
        path: "senderDetails",
        select: "firstName lastName profilePicture isVerified",
      })
      .populate({
        path: "receiverDetails",
        select: "firstName lastName profilePicture isVerified",
      })
      .skip(skip)
      .limit(limit)
      .sort({ updatedAt: -1 });

    const total = await this.model.countDocuments({
      $or: [
        {
          sender: new Types.ObjectId(userId),
          status: FriendRequestStatus.accepted,
        },
        {
          receiver: new Types.ObjectId(userId),
          status: FriendRequestStatus.accepted,
        },
      ],
    });

    // Extract friend details
    const friends = friendRequests.map((request) => {
      const isReceiver = request.receiver.toString() === userId;
      return isReceiver ? request.senderDetails : request.receiverDetails;
    });

    return {
      data: friends,
      total,
      page,
      limit,
    };
  }

  // Remove friendship (delete accepted friend request)
  async removeFriendship(userId1: string, userId2: string): Promise<boolean> {
    const result = await this.model.findOneAndDelete({
      $or: [
        {
          sender: userId1,
          receiver: userId2,
          status: FriendRequestStatus.accepted,
        },
        {
          sender: userId2,
          receiver: userId1,
          status: FriendRequestStatus.accepted,
        },
      ],
    });
    return !!result;
  }
}
