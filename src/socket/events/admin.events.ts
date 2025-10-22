// @ts-nocheck
import { Server as SocketServer, Namespace } from "socket.io";
import { AuthenticatedSocket } from "../middleware/auth.middleware.js";
import {
  getOnlineUsersCount,
  getOnlineUsers,
  connectedUsers,
} from "../server.js";
import userModel from "../../db/model/user.model.js";
import postModel from "../../db/model/post.model.js";
import commentModel from "../../db/model/comment.model.js";

export const registerAdminEvents = (
  socket: AuthenticatedSocket,
  namespace: Namespace
) => {
  socket.on("admin:get_dashboard_stats", async (callback) => {
    try {
      const totalUsers = await userModel.countDocuments();
      const totalPosts = await postModel.countDocuments();
      const totalComments = await commentModel.countDocuments();
      const onlineUsers = getOnlineUsersCount();
      const frozenUsers = await userModel.countDocuments({ isFrozen: true });
      const deletedUsers = await userModel.countDocuments({ isDeleted: true });

      // @ts-ignore - Mongoose model conditional export union type issue
      const recentUsers: any[] = await userModel
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .select("email fName lName createdAt role")
        .exec();

      const stats = {
        users: {
          total: totalUsers,
          online: onlineUsers,
          frozen: frozenUsers,
          deleted: deletedUsers,
        },
        posts: {
          total: totalPosts,
        },
        comments: {
          total: totalComments,
        },
        recentUsers,
        timestamp: new Date(),
      };

      if (callback) {
        callback({
          success: true,
          stats,
        });
      }

      console.log(`Admin ${socket.user?.email} requested dashboard stats`);
    } catch (error: any) {
      console.error("Error fetching admin dashboard stats:", error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
        });
      }
    }
  });

  socket.on("admin:get_online_users", (callback) => {
    try {
      const onlineUserIds = getOnlineUsers();
      const onlineUserData = onlineUserIds.map((userId) => {
        const user = connectedUsers.get(userId);
        return {
          userId,
          connectedAt: user?.connectedAt,
          lastActivity: user?.lastActivity,
          tabCount: user?.tabs.size || 0,
        };
      });

      if (callback) {
        callback({
          success: true,
          onlineUsers: onlineUserData,
          totalOnline: onlineUserData.length,
        });
      }

      console.log(`Admin ${socket.user?.email} requested online users list`);
    } catch (error: any) {
      console.error("Error fetching online users:", error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
        });
      }
    }
  });

  socket.on(
    "admin:broadcast_message",
    (data: { message: string; type: string }) => {
      try {
        const { message, type = "info" } = data;

        namespace.to("/").emit("admin:system_message", {
          message,
          type,
          from: socket.user?.email,
          timestamp: new Date(),
        });

        console.log(
          `Admin ${socket.user?.email} broadcast message: ${message}`
        );

        socket.emit("admin:broadcast_sent", {
          success: true,
          message: "Message broadcast successfully",
        });
      } catch (error: any) {
        console.error("Error broadcasting admin message:", error);
        socket.emit("admin:broadcast_error", {
          success: false,
          error: error.message,
        });
      }
    }
  );

  socket.on(
    "admin:kick_user",
    (data: { userId: string; reason: string }, callback) => {
      try {
        const { userId, reason } = data;

        const userConnections = connectedUsers.get(userId);
        if (userConnections) {
          namespace.to(`user:${userId}`).emit("admin:kicked", {
            reason: reason || "You have been kicked by an administrator",
            timestamp: new Date(),
          });

          console.log(
            `Admin ${socket.user?.email} kicked user ${userId} for: ${reason}`
          );

          if (callback) {
            callback({
              success: true,
              message: "User kicked successfully",
            });
          }
        } else {
          if (callback) {
            callback({
              success: false,
              error: "User is not online",
            });
          }
        }
      } catch (error: any) {
        console.error("Error kicking user:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );

  socket.on(
    "admin:get_user_sessions",
    async (data: { userId: string }, callback) => {
      try {
        const { userId } = data;

        // @ts-ignore - Mongoose model conditional export union type issue
        const user: any = await userModel
          .findOne({ _id: userId })
          .select("email fName lName role")
          .exec();

        if (!user) {
          if (callback) {
            callback({
              success: false,
              error: "User not found",
            });
          }
          return;
        }

        const userConnections = connectedUsers.get(userId);
        const sessions = userConnections
          ? {
              isOnline: true,
              connectedAt: userConnections.connectedAt,
              lastActivity: userConnections.lastActivity,
              activeTabsCount: userConnections.tabs.size,
            }
          : {
              isOnline: false,
            };

        if (callback) {
          callback({
            success: true,
            user: {
              _id: user._id,
              email: user.email,
              name: `${user.fName} ${user.lName}`,
              role: user.role,
            },
            sessions,
          });
        }

        console.log(
          `Admin ${socket.user?.email} requested sessions for user ${userId}`
        );
      } catch (error: any) {
        console.error("Error fetching user sessions:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );
};
