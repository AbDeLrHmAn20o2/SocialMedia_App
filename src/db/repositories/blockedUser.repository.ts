import BlockedUser, { IBlockedUser } from "../model/blockedUser.model.js";
import { Types } from "mongoose";

export interface BlockedUserQueryOptions {
  page?: number;
  limit?: number;
  populateBlocker?: boolean;
  populateBlocked?: boolean;
}

export class BlockedUserRepository {
  private model = BlockedUser;

  // Block a user
  async create(blockData: Partial<IBlockedUser>): Promise<IBlockedUser> {
    const blockedUser = new this.model(blockData);
    return await blockedUser.save();
  }

  // Find blocked relationship by ID
  async findById(id: string): Promise<IBlockedUser | null> {
    return await this.model.findById(id);
  }

  // Check if user is blocked
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const blockedUser = await this.model.findOne({
      blocker: new Types.ObjectId(blockerId),
      blocked: new Types.ObjectId(blockedId),
    });
    return !!blockedUser;
  }

  // Check if users have any block relationship
  async hasBlockRelationship(
    userId1: string,
    userId2: string
  ): Promise<boolean> {
    const blockedUser = await this.model.findOne({
      $or: [
        { blocker: userId1, blocked: userId2 },
        { blocker: userId2, blocked: userId1 },
      ],
    });
    return !!blockedUser;
  }

  // Get list of users blocked by a specific user
  async getBlockedUsers(
    blockerId: string,
    options: BlockedUserQueryOptions = {}
  ): Promise<{
    data: IBlockedUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, populateBlocked = true } = options;
    const skip = (page - 1) * limit;

    let query = this.model.find({
      blocker: new Types.ObjectId(blockerId),
    });

    if (populateBlocked) {
      query = query.populate({
        path: "blockedDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    const results = await query.skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await this.model.countDocuments({
      blocker: new Types.ObjectId(blockerId),
    });

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Get list of users who blocked a specific user
  async getUsersWhoBlocked(
    blockedId: string,
    options: BlockedUserQueryOptions = {}
  ): Promise<{
    data: IBlockedUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, populateBlocker = true } = options;
    const skip = (page - 1) * limit;

    let query = this.model.find({
      blocked: new Types.ObjectId(blockedId),
    });

    if (populateBlocker) {
      query = query.populate({
        path: "blockerDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    const results = await query.skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await this.model.countDocuments({
      blocked: new Types.ObjectId(blockedId),
    });

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  // Unblock a user
  async unblock(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.model.findOneAndDelete({
      blocker: new Types.ObjectId(blockerId),
      blocked: new Types.ObjectId(blockedId),
    });
    return !!result;
  }

  // Delete blocked relationship by ID
  async deleteById(id: string): Promise<IBlockedUser | null> {
    return await this.model.findByIdAndDelete(id);
  }

  // Get all blocked relationships (admin function)
  async getAllBlocked(options: BlockedUserQueryOptions = {}): Promise<{
    data: IBlockedUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      populateBlocker = true,
      populateBlocked = true,
    } = options;
    const skip = (page - 1) * limit;

    let query = this.model.find({});

    if (populateBlocker) {
      query = query.populate({
        path: "blockerDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    if (populateBlocked) {
      query = query.populate({
        path: "blockedDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    const results = await query.skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await this.model.countDocuments({});

    return {
      data: results,
      total,
      page,
      limit,
    };
  }
}
