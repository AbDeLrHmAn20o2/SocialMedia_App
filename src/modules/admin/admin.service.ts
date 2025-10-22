// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import userModel, { RoleType } from "../../db/model/user.model.js";
import postModel from "../../db/model/post.model.js";
import commentModel from "../../db/model/comment.model.js";
import friendRequestModel from "../../db/model/friendRequest.model.js";
import {
  getOnlineUsersCount,
  getOnlineUsers,
  connectedUsers,
} from "../../socket/server.js";
import {
  sendNotification,
  NotificationType,
} from "../../socket/events/notification.events.js";
import { z } from "zod";

export const updateRoleSchema = {
  body: z
    .strictObject({
      role: z.enum(["user", "admin"]),
      reason: z.string().min(1).max(500).optional(),
    })
    .required(),
};

export type updateRoleSchemaType = z.infer<typeof updateRoleSchema.body>;

class AdminService {
  getDashboardStats = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const [
        totalUsers,
        totalPosts,
        totalComments,
        totalFriendRequests,
        frozenUsers,
        deletedUsers,
        activeUsers,
        recentUsers,
        recentPosts,
      ] = await Promise.all([
        userModel.countDocuments({ isDeleted: false }),
        postModel.countDocuments({ isDeleted: false }),
        commentModel.countDocuments({ isDeleted: false }),
        friendRequestModel.countDocuments(),
        userModel.countDocuments({ isFrozen: true, isDeleted: false }),
        userModel.countDocuments({ isDeleted: true }),
        userModel.countDocuments({
          isDeleted: false,
          isFrozen: false,
          isConfirmed: true,
        }),
        // @ts-ignore - Mongoose model conditional export union type issue
        userModel
          .find({ isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(10)
          .select("email fName lName role createdAt isConfirmed isFrozen")
          .exec(),
        // @ts-ignore - Mongoose model conditional export union type issue
        postModel
          .find({ isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("author", "fName lName email")
          .select("title content author createdAt likesCount commentsCount")
          .exec(),
      ]);

      const onlineUsers = getOnlineUsersCount();

      res.json({
        success: true,
        stats: {
          users: {
            total: totalUsers,
            active: activeUsers,
            frozen: frozenUsers,
            deleted: deletedUsers,
            online: onlineUsers,
          },
          posts: {
            total: totalPosts,
          },
          comments: {
            total: totalComments,
          },
          friendRequests: {
            total: totalFriendRequests,
          },
          recentUsers,
          recentPosts,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const {
        page = 1,
        limit = 20,
        search,
        role,
        isFrozen,
        isConfirmed,
      } = req.query;

      const query: any = {};

      if (search) {
        query.$or = [
          { email: { $regex: search, $options: "i" } },
          { fName: { $regex: search, $options: "i" } },
          { lName: { $regex: search, $options: "i" } },
          { userName: { $regex: search, $options: "i" } },
        ];
      }

      if (role) query.role = role;
      if (isFrozen !== undefined) query.isFrozen = isFrozen === "true";
      if (isConfirmed !== undefined) query.isConfirmed = isConfirmed === "true";

      const skip = (Number(page) - 1) * Number(limit);
      const total = await userModel.countDocuments(query);

      // @ts-ignore - Mongoose model conditional export union type issue
      const users: any[] = await userModel
        .find(query)
        .select("-password -__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .exec();

      res.json({
        success: true,
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getUserDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const { userId } = req.params;

      // @ts-ignore - Mongoose model conditional export union type issue
      const user: any = await userModel
        .findOne({ _id: userId })
        .select("-password -__v")
        .exec();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const [postsCount, commentsCount, friendsCount] = await Promise.all([
        postModel.countDocuments({ author: userId, isDeleted: false }),
        commentModel.countDocuments({ author: userId, isDeleted: false }),
        friendRequestModel.countDocuments({
          $or: [{ sender: userId }, { receiver: userId }],
          status: "accepted",
        }),
      ]);

      const isOnline = userId ? getOnlineUsers().includes(userId) : false;
      const userConnection = userId ? connectedUsers.get(userId) : undefined;

      res.json({
        success: true,
        user: {
          ...user.toObject(),
          stats: {
            posts: postsCount,
            comments: commentsCount,
            friends: friendsCount,
          },
          connection: {
            isOnline,
            connectedAt: userConnection?.connectedAt,
            lastActivity: userConnection?.lastActivity,
            activeTabsCount: userConnection?.tabs.size || 0,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const { userId } = req.params;
      const { role, reason }: updateRoleSchemaType = req.body;

      if (userId === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "You cannot change your own role",
        });
      }

      // @ts-ignore - Mongoose model conditional export union type issue
      const user: any = await userModel.findOne({ _id: userId }).exec();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      if (user.role === role) {
        return res.status(400).json({
          success: false,
          error: `User is already a ${role}`,
        });
      }

      const oldRole = user.role;
      user.role = role as RoleType;
      await user.save();

      console.log(
        `Admin ${req.user.email} changed user ${
          user.email
        } role from ${oldRole} to ${role}${
          reason ? ` - Reason: ${reason}` : ""
        }`
      );

      res.json({
        success: true,
        message: `User role updated from ${oldRole} to ${role}`,
        user: {
          _id: user._id,
          email: user.email,
          fName: user.fName,
          lName: user.lName,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const { userId } = req.params;
      const { permanent = false } = req.query;

      if (userId === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "You cannot delete your own account",
        });
      }

      // @ts-ignore - Mongoose model conditional export union type issue
      const user: any = await userModel.findOne({ _id: userId }).exec();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      if (permanent === "true") {
        await userModel.deleteOne({ _id: userId });
        console.log(
          `Admin ${req.user.email} permanently deleted user ${user.email}`
        );

        res.json({
          success: true,
          message: "User permanently deleted",
        });
      } else {
        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save();

        console.log(`Admin ${req.user.email} soft deleted user ${user.email}`);

        res.json({
          success: true,
          message: "User soft deleted",
        });
      }
    } catch (error) {
      next(error);
    }
  };

  getContentModeration = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized: Admin access required",
        });
      }

      const { type = "posts", page = 1, limit = 20 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      if (type === "posts") {
        const [posts, total] = await Promise.all([
          // @ts-ignore - Mongoose model conditional export union type issue
          postModel
            .find({ isDeleted: false })
            .populate("author", "fName lName email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .exec(),
          postModel.countDocuments({ isDeleted: false }),
        ]);

        res.json({
          success: true,
          posts,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        });
      } else if (type === "comments") {
        const [comments, total] = await Promise.all([
          // @ts-ignore - Mongoose model conditional export union type issue
          commentModel
            .find({ isDeleted: false })
            .populate("author", "fName lName email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .exec(),
          commentModel.countDocuments({ isDeleted: false }),
        ]);

        res.json({
          success: true,
          comments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Invalid content type. Use 'posts' or 'comments'",
        });
      }
    } catch (error) {
      next(error);
    }
  };
}

export default new AdminService();
