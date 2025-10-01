import { Model } from "mongoose";
import { IPostReaction, ReactionType } from "../model/postReaction.model.js";

export class PostReactionRepository {
  private model: Model<IPostReaction>;

  constructor(model: Model<IPostReaction>) {
    this.model = model;
  }

  async toggleReaction(
    userId: string,
    postId: string,
    reactionType: ReactionType
  ) {
    const existingReaction = await this.model.findOne({
      user: userId,
      post: postId,
    });

    if (existingReaction) {
      if (existingReaction.reactionType === reactionType) {
        // Remove reaction if same type
        await this.model.findByIdAndDelete(existingReaction._id);
        return { action: "removed", reactionType: null };
      } else {
        // Update reaction type
        await this.model.findByIdAndUpdate(
          existingReaction._id,
          { reactionType },
          { new: true }
        );
        return { action: "updated", reactionType };
      }
    } else {
      // Create new reaction
      await this.model.create({
        user: userId,
        post: postId,
        reactionType,
      });
      return { action: "created", reactionType };
    }
  }

  async getUserReaction(userId: string, postId: string) {
    return await this.model.findOne({
      user: userId,
      post: postId,
    });
  }

  async getReactionCounts(postId: string) {
    const reactions = await this.model.aggregate([
      { $match: { post: postId } },
      {
        $group: {
          _id: "$reactionType",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = {
      likes: 0,
      dislikes: 0,
    };

    reactions.forEach((reaction) => {
      if (reaction._id === ReactionType.like) {
        counts.likes = reaction.count;
      } else if (reaction._id === ReactionType.dislike) {
        counts.dislikes = reaction.count;
      }
    });

    return counts;
  }

  async getPostReactions(postId: string, reactionType?: ReactionType) {
    const query: any = { post: postId };
    if (reactionType) query.reactionType = reactionType;

    return await this.model
      .find(query)
      .populate("user", "fName lName profilePicture")
      .sort({ createdAt: -1 });
  }

  async removeAllReactions(postId: string) {
    return await this.model.deleteMany({ post: postId });
  }
}
