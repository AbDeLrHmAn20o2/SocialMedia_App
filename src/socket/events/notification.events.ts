import { Server as SocketServer } from "socket.io";
import { AuthenticatedSocket } from "../middleware/auth.middleware.js";
import { emitToUser } from "../server.js";

export enum NotificationType {
  FRIEND_REQUEST = "friend_request",
  FRIEND_REQUEST_ACCEPTED = "friend_request_accepted",
  POST_LIKE = "post_like",
  POST_COMMENT = "post_comment",
  COMMENT_REPLY = "comment_reply",
  MENTION = "mention",
  SYSTEM = "system",
}

interface Notification {
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  link?: string;
}

export const registerNotificationEvents = (
  socket: AuthenticatedSocket,
  io: SocketServer
) => {
  socket.on("notification:subscribe", () => {
    socket.join(`notifications:${socket.userId}`);
    console.log(`User ${socket.userId} subscribed to notifications`);

    socket.emit("notification:subscribed", {
      success: true,
      message: "Subscribed to notifications",
    });
  });

  socket.on("notification:unsubscribe", () => {
    socket.leave(`notifications:${socket.userId}`);
    console.log(`User ${socket.userId} unsubscribed from notifications`);
  });

  socket.on(
    "notification:mark_read",
    (data: { notificationId: string }, callback) => {
      try {
        const { notificationId } = data;

        console.log(
          `Notification ${notificationId} marked as read by ${socket.userId}`
        );

        if (callback) {
          callback({
            success: true,
            message: "Notification marked as read",
          });
        }
      } catch (error: any) {
        console.error("Error marking notification as read:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );

  socket.on("notification:mark_all_read", (callback) => {
    try {
      console.log(`All notifications marked as read for user ${socket.userId}`);

      if (callback) {
        callback({
          success: true,
          message: "All notifications marked as read",
        });
      }
    } catch (error: any) {
      console.error("Error marking all notifications as read:", error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
        });
      }
    }
  });
};

// Singleton to store the io instance
let socketIOInstance: SocketServer | null = null;

export const setSocketIOInstance = (io: SocketServer) => {
  socketIOInstance = io;
};

export const getSocketIOInstance = (): SocketServer | null => {
  return socketIOInstance;
};

export const sendNotification = (
  io: SocketServer,
  userId: string,
  notification: Notification
) => {
  emitToUser(io, userId, "notification:new", {
    ...notification,
    timestamp: new Date(),
    read: false,
  });

  console.log(`Notification sent to user ${userId}:`, notification.type);
};

// Helper function that uses the global instance
export const sendNotificationToUser = (
  userId: string,
  notification: Notification
) => {
  if (!socketIOInstance) {
    console.warn("Socket.IO instance not initialized. Notification not sent.");
    return;
  }
  sendNotification(socketIOInstance, userId, notification);
};

export const broadcastSystemNotification = (
  io: SocketServer,
  notification: Omit<Notification, "type">
) => {
  io.emit("notification:system", {
    type: NotificationType.SYSTEM,
    ...notification,
    timestamp: new Date(),
  });

  console.log("System notification broadcast:", notification.title);
};

// Helper function for broadcasting
export const broadcastSystemNotificationGlobal = (
  notification: Omit<Notification, "type">
) => {
  if (!socketIOInstance) {
    console.warn("Socket.IO instance not initialized. Broadcast not sent.");
    return;
  }
  broadcastSystemNotification(socketIOInstance, notification);
};
