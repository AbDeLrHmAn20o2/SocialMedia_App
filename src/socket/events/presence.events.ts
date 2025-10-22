import { Server as SocketServer } from "socket.io";
import { AuthenticatedSocket } from "../middleware/auth.middleware.js";
import {
  connectedUsers,
  getUserTabCount,
  isUserOnline,
  getOnlineUsersCount,
} from "../server.js";

export enum UserStatus {
  ONLINE = "online",
  AWAY = "away",
  BUSY = "busy",
  OFFLINE = "offline",
}

const userStatuses = new Map<string, UserStatus>();

export const registerPresenceEvents = (
  socket: AuthenticatedSocket,
  io: SocketServer
) => {
  socket.on("presence:status_change", (data: { status: UserStatus }) => {
    const { status } = data;
    const userId = socket.userId!;

    userStatuses.set(userId, status);

    io.emit("presence:user_status_changed", {
      userId,
      status,
      timestamp: new Date(),
    });

    console.log(`User ${userId} changed status to ${status}`);
  });

  socket.on("presence:check_user", (data: { userId: string }, callback) => {
    try {
      const { userId } = data;

      const isOnline = isUserOnline(userId);
      const status = userStatuses.get(userId) || UserStatus.OFFLINE;
      const tabCount = getUserTabCount(userId);

      if (callback) {
        callback({
          success: true,
          user: {
            userId,
            isOnline,
            status,
            tabCount,
            lastActivity: connectedUsers.get(userId)?.lastActivity,
          },
        });
      }
    } catch (error: any) {
      console.error("Error checking user presence:", error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
        });
      }
    }
  });

  socket.on(
    "presence:get_online_friends",
    (data: { friendIds: string[] }, callback) => {
      try {
        const { friendIds } = data;

        const onlineFriends = friendIds
          .filter((friendId) => isUserOnline(friendId))
          .map((friendId) => ({
            userId: friendId,
            status: userStatuses.get(friendId) || UserStatus.ONLINE,
            tabCount: getUserTabCount(friendId),
            lastActivity: connectedUsers.get(friendId)?.lastActivity,
          }));

        if (callback) {
          callback({
            success: true,
            onlineFriends,
            totalOnline: onlineFriends.length,
          });
        }
      } catch (error: any) {
        console.error("Error getting online friends:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );

  socket.on("presence:get_stats", (callback) => {
    try {
      const totalOnlineUsers = getOnlineUsersCount();

      const statsByStatus = {
        online: 0,
        away: 0,
        busy: 0,
      };

      userStatuses.forEach((status) => {
        if (status in statsByStatus) {
          statsByStatus[status as keyof typeof statsByStatus]++;
        }
      });

      if (callback) {
        callback({
          success: true,
          stats: {
            totalOnlineUsers,
            byStatus: statsByStatus,
          },
        });
      }
    } catch (error: any) {
      console.error("Error getting presence stats:", error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const userId = socket.userId!;

    if (!isUserOnline(userId)) {
      userStatuses.set(userId, UserStatus.OFFLINE);

      io.emit("presence:user_status_changed", {
        userId,
        status: UserStatus.OFFLINE,
        timestamp: new Date(),
      });
    }
  });
};

export const getUserStatus = (userId: string): UserStatus => {
  return userStatuses.get(userId) || UserStatus.OFFLINE;
};
