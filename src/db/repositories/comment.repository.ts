import { Types } from "mongoose";
import Comment, {
  IComment,
  CommentType,
  CommentStatus,
} from "../model/comment.model.js";

export interface CommentQueryOptions {
  page?: number | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
  sortBy?: "createdAt" | "likesCount" | "repliesCount" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
  status?: CommentStatus | undefined;
  depth?: number | undefined;
  maxDepth?: number | undefined;
  author?: string | undefined;
  includeReplies?: boolean | undefined;
  includeNestedReplies?: boolean | undefined;
  populateAuthor?: boolean | undefined;
  populateCommentOn?: boolean | undefined;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page?: number | undefined;
    limit: number;
    total: number;
    totalPages?: number | undefined;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export class CommentRepository {
  private model = Comment;

  async create(commentData: Partial<IComment>): Promise<IComment> {
    const comment = new this.model(commentData);
    return await comment.save();
  }

  async findById(
    id: string,
    options: CommentQueryOptions = {}
  ): Promise<IComment | null> {
    let query = this.model.findById(id);

    query = this.applyPopulation(query, options);

    return await query.exec();
  }

  async getComments(
    commentOn: string,
    commentOnModel: CommentType,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    const {
      page = 1,
      limit = 20,
      cursor,
      sortBy = "createdAt",
      sortOrder = "desc",
      status = CommentStatus.active,
      depth,
      maxDepth,
      author,
    } = options;

    const baseQuery: any = {
      commentOn: new Types.ObjectId(commentOn),
      commentOnModel,
      status,
      isDeleted: false,
    };

    if (depth !== undefined) {
      baseQuery.depth = depth;
    } else if (maxDepth !== undefined) {
      baseQuery.depth = { $lte: maxDepth };
    }

    if (author) {
      baseQuery.author = new Types.ObjectId(author);
    }

    if (cursor) {
      return await this.getCursorPaginatedComments(baseQuery, options);
    }

    return await this.getOffsetPaginatedComments(baseQuery, options);
  }

  async getRootComments(
    commentOn: string,
    commentOnModel: CommentType,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    return await this.getComments(commentOn, commentOnModel, {
      ...options,
      depth: 0,
    });
  }

  async getReplies(
    parentCommentId: string,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "asc",
      maxDepth,
    } = options;

    const baseQuery: any = {
      parentComment: new Types.ObjectId(parentCommentId),
      status: CommentStatus.active,
      isDeleted: false,
    };

    if (maxDepth !== undefined) {
      baseQuery.depth = { $lte: maxDepth };
    }

    return await this.getOffsetPaginatedComments(baseQuery, options);
  }

  async getNestedComments(
    rootCommentId: string,
    options: CommentQueryOptions = {}
  ): Promise<IComment[]> {
    const { maxDepth = 5, sortBy = "createdAt", sortOrder = "asc" } = options;

    let query = this.model.find({
      rootComment: new Types.ObjectId(rootCommentId),
      status: CommentStatus.active,
      isDeleted: false,
      depth: { $lte: maxDepth },
    });

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    query = query.sort({ [sortBy]: sortDirection });

    query = this.applyPopulation(query, options);

    return await query.exec();
  }

  async updateById(
    id: string,
    updateData: Partial<IComment>
  ): Promise<IComment | null> {
    const updatePayload = { ...updateData };

    if (updateData.content) {
      updatePayload.isEdited = true;
      updatePayload.editedAt = new Date();
    }

    return await this.model.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<IComment | null> {
    return await this.model.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: new Types.ObjectId(deletedBy),
          status: CommentStatus.deleted,
        },
      },
      { new: true }
    );
  }

  async updateMetrics(
    id: string,
    metrics: {
      likesCount?: number;
      dislikesCount?: number;
      repliesCount?: number;
      totalRepliesCount?: number;
    }
  ): Promise<IComment | null> {
    const updateFields: any = {};

    Object.entries(metrics).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    });

    return await this.model.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );
  }

  async incrementField(
    id: string,
    field: string,
    value: number = 1
  ): Promise<IComment | null> {
    return await this.model.findByIdAndUpdate(
      id,
      { $inc: { [field]: value } },
      { new: true }
    );
  }

  async getUserComments(
    userId: string,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    const baseQuery = {
      author: new Types.ObjectId(userId),
      status: CommentStatus.active,
      isDeleted: false,
    };

    return await this.getOffsetPaginatedComments(baseQuery, options);
  }

  async searchComments(
    searchText: string,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    const baseQuery = {
      content: { $regex: searchText, $options: "i" },
      status: CommentStatus.active,
      isDeleted: false,
    };

    return await this.getOffsetPaginatedComments(baseQuery, options);
  }

  async countDocuments(query: any = {}): Promise<number> {
    return await this.model.countDocuments({
      ...query,
      isDeleted: false,
    });
  }

  private async getCursorPaginatedComments(
    baseQuery: any,
    options: CommentQueryOptions
  ): Promise<PaginationResult<IComment>> {
    const {
      limit = 20,
      cursor,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    if (cursor) {
      const cursorQuery =
        sortOrder === "desc"
          ? { [sortBy]: { $lt: new Date(cursor) } }
          : { [sortBy]: { $gt: new Date(cursor) } };
      Object.assign(baseQuery, cursorQuery);
    }

    let query = this.model.find(baseQuery);

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    query = query.sort({ [sortBy]: sortDirection });

    query = query.limit(limit + 1);

    query = this.applyPopulation(query, options);

    const results = await query.exec();
    const hasNextPage = results.length > limit;

    if (hasNextPage) {
      results.pop(); // Remove the extra item
    }

    const nextCursor =
      hasNextPage && results.length > 0 && results[results.length - 1]
        ? String((results[results.length - 1] as any)[sortBy])
        : undefined;

    const prevCursor =
      results.length > 0 && results[0]
        ? String((results[0] as any)[sortBy])
        : undefined;

    return {
      data: results,
      pagination: {
        limit,
        total: await this.countDocuments(baseQuery),
        hasNextPage,
        hasPrevPage: !!cursor,
        nextCursor,
        prevCursor,
      },
    };
  }

  private async getOffsetPaginatedComments(
    baseQuery: any,
    options: CommentQueryOptions
  ): Promise<PaginationResult<IComment>> {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (page - 1) * limit;
    const total = await this.countDocuments(baseQuery);

    let query = this.model.find(baseQuery);

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    query = query.sort({ [sortBy]: sortDirection });

    query = query.skip(skip).limit(limit);

    query = this.applyPopulation(query, options);

    const results = await query.exec();
    const totalPages = Math.ceil(total / limit);

    return {
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  private applyPopulation(query: any, options: CommentQueryOptions): any {
    const {
      populateAuthor = true,
      populateCommentOn = false,
      includeReplies = false,
      includeNestedReplies = false,
    } = options;

    if (populateAuthor) {
      query = query.populate({
        path: "authorDetails",
        select: "firstName lastName profilePicture isVerified",
      });
    }

    if (populateCommentOn) {
      query = query.populate({
        path: "commentOnDetails",
        select: "title content author",
      });
    }

    if (includeReplies) {
      query = query.populate({
        path: "replies",
        populate: {
          path: "authorDetails",
          select: "firstName lastName profilePicture isVerified",
        },
      });
    }

    if (includeNestedReplies) {
      query = query.populate({
        path: "nestedReplies",
        populate: {
          path: "authorDetails",
          select: "firstName lastName profilePicture isVerified",
        },
      });
    }

    return query;
  }

  async freezeComment(
    id: string,
    frozenBy: string,
    reason?: string,
    duration?: number
  ): Promise<IComment | null> {
    const updateData: any = {
      isFrozen: true,
      frozenAt: new Date(),
      frozenBy,
      status: CommentStatus.frozen,
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

  async unfreezeComment(id: string, reason?: string): Promise<IComment | null> {
    const updateData: any = {
      isFrozen: false,
      status: CommentStatus.active,
      $unset: {
        frozenAt: 1,
        frozenBy: 1,
        frozenReason: 1,
        frozenUntil: 1,
      },
    };

    return await this.model.findByIdAndUpdate(id, updateData, { new: true });
  }

  async hardDelete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id);
    return !!result;
  }

  async hardDeleteByPost(postId: string): Promise<number> {
    const result = await this.model.deleteMany({
      commentOn: new Types.ObjectId(postId),
      commentOnModel: CommentType.post,
    });
    return result.deletedCount || 0;
  }

  async hardDeleteByUser(userId: string): Promise<number> {
    const result = await this.model.deleteMany({
      author: new Types.ObjectId(userId),
    });
    return result.deletedCount || 0;
  }

  async getCommentsByAuthorAdmin(
    userId: string,
    options: CommentQueryOptions = {}
  ): Promise<PaginationResult<IComment>> {
    const {
      page = 1,
      limit = 20,
      includeDeleted = false,
      includeFrozen = true,
    } = options as any;

    const baseQuery: any = { author: new Types.ObjectId(userId) };

    if (!includeDeleted) {
      baseQuery.isDeleted = false;
    }

    if (!includeFrozen) {
      baseQuery.isFrozen = false;
    }

    return await this.getOffsetPaginatedComments(baseQuery, options);
  }

  async findByIdAdmin(id: string, options: any = {}): Promise<IComment | null> {
    const {
      includeDeleted = false,
      includeFrozen = true,
      populateAuthor = true,
    } = options;
    const query: any = { _id: id };

    if (!includeDeleted) {
      query.isDeleted = false;
    }

    if (!includeFrozen) {
      query.isFrozen = false;
    }

    let mongoQuery = this.model.findOne(query);

    if (populateAuthor) {
      mongoQuery = mongoQuery.populate(
        "author",
        "firstName lastName profilePicture"
      );
    }

    return await mongoQuery.exec();
  }
}
