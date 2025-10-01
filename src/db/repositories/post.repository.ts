import { Model } from "mongoose";
import { IPost } from "../model/post.model.js";

export class PostRepository {
  private model: Model<IPost>;

  constructor(model: Model<IPost>) {
    this.model = model;
  }

  async create(postData: Partial<IPost>) {
    return await this.model.create(postData);
  }

  async findById(id: string, includeDeleted = false) {
    const options = includeDeleted ? { includeDeleted: true } : {};
    return await this.model
      .findById(id, null, options)
      .populate("authorDetails");
  }

  async findOne(query: any, includeDeleted = false) {
    const options = includeDeleted ? { includeDeleted: true } : {};
    return await this.model
      .findOne(query, null, options)
      .populate("authorDetails");
  }

  async find(query: any = {}, options: any = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      includeDeleted = false,
    } = options;
    const mongoOptions = includeDeleted ? { includeDeleted: true } : {};

    return await this.model
      .find(query, null, mongoOptions)
      .populate("authorDetails")
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit);
  }

  async updateOne(query: any, update: any) {
    return await this.model.findOneAndUpdate(query, update, { new: true });
  }

  async updateById(id: string, update: any) {
    return await this.model.findByIdAndUpdate(id, update, { new: true });
  }

  async softDelete(id: string, deletedBy: string) {
    return await this.model.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
      { new: true }
    );
  }

  async restore(id: string) {
    return await this.model.findByIdAndUpdate(
      id,
      {
        $unset: {
          isDeleted: "",
          deletedAt: "",
          deletedBy: "",
        },
      },
      { new: true }
    );
  }

  async countDocuments(query: any = {}) {
    return await this.model.countDocuments(query);
  }

  async incrementField(id: string, field: string, value = 1) {
    return await this.model.findByIdAndUpdate(
      id,
      { $inc: { [field]: value } },
      { new: true }
    );
  }

  async getUserPosts(userId: string, options: any = {}) {
    const { page = 1, limit = 10, status, availability } = options;
    const query: any = { author: userId };

    if (status) query.status = status;
    if (availability) query.availability = availability;

    return await this.find(query, { page, limit });
  }

  async getPublicPosts(options: any = {}) {
    const query = {
      status: "published",
      availability: "public",
    };

    return await this.find(query, options);
  }

  // Freeze post
  async freezePost(
    id: string,
    frozenBy: string,
    reason?: string,
    duration?: number // duration in days
  ): Promise<any> {
    const updateData: any = {
      isFrozen: true,
      frozenAt: new Date(),
      frozenBy,
      status: "frozen",
    };

    if (reason) updateData.frozenReason = reason;
    if (duration) {
      const frozenUntil = new Date();
      frozenUntil.setDate(frozenUntil.getDate() + duration);
      updateData.frozenUntil = frozenUntil;
    }

    return await this.model.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
  }

  // Unfreeze post
  async unfreezePost(id: string, reason?: string): Promise<any> {
    const updateData: any = {
      isFrozen: false,
      status: "published",
      $unset: {
        frozenAt: 1,
        frozenBy: 1,
        frozenReason: 1,
        frozenUntil: 1,
      },
    };

    return await this.model.findByIdAndUpdate(id, updateData, { new: true });
  }

  // Hard delete post (permanent deletion)
  async hardDelete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id);
    return !!result;
  }

  // Get posts by author with all statuses (admin function)
  async getPostsByAuthorAdmin(userId: string, options: any = {}): Promise<any> {
    const {
      page = 1,
      limit = 20,
      includeDeleted = false,
      includeFrozen = true,
    } = options;
    const query: any = { author: userId };

    if (!includeDeleted) {
      query.isDeleted = false;
    }

    if (!includeFrozen) {
      query.isFrozen = false;
    }

    return await this.find(query, { page, limit });
  }

  // Find post with all conditions (admin function)
  async findByIdAdmin(id: string, options: any = {}): Promise<any> {
    const { includeDeleted = false, includeFrozen = true } = options;
    const query: any = { _id: id };

    if (!includeDeleted) {
      query.isDeleted = false;
    }

    if (!includeFrozen) {
      query.isFrozen = false;
    }

    return await this.model
      .findOne(query)
      .populate("author", "firstName lastName profilePicture");
  }
}
