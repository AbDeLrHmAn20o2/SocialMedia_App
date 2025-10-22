import { Server as SocketServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import {
  socketAuthMiddleware,
  socketRoleMiddleware,
  AuthenticatedSocket,
} from "./middleware/auth.middleware.js";
import { socketErrorHandler } from "./middleware/errorHandler.js";
import { registerChatEvents } from "./events/chat.events.js";
import {
  registerNotificationEvents,
  setSocketIOInstance,
} from "./events/notification.events.js";
import { registerPresenceEvents } from "./events/presence.events.js";
import { registerAdminEvents } from "./events/admin.events.js";
import { RoleType } from "../db/model/user.model.js";

export interface ConnectedUser {
  userId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  tabs: Set<string>;
}

export const connectedUsers = new Map<string, ConnectedUser>();
export const userSockets = new Map<string, Set<string>>();

export const initializeSocketServer = (
  httpServer: HTTPServer
): SocketServer => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`Client connected: ${socket.id}`);

    const userId = socket.userId!;

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, {
        userId,
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date(),
        tabs: new Set([socket.id]),
      });
    } else {
      const user = connectedUsers.get(userId)!;
      user.tabs.add(socket.id);
      user.lastActivity = new Date();
    }

    socket.join(`user:${userId}`);

    socket.on("error", (error: Error) => {
      socketErrorHandler(error, socket);
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);

      const socketSet = userSockets.get(userId);
      if (socketSet) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          userSockets.delete(userId);
          connectedUsers.delete(userId);
        }
      }

      const user = connectedUsers.get(userId);
      if (user) {
        user.tabs.delete(socket.id);
        if (user.tabs.size === 0) {
          connectedUsers.delete(userId);
        }
      }
    });

    socket.on("heartbeat", () => {
      const user = connectedUsers.get(userId);
      if (user) {
        user.lastActivity = new Date();
      }
      socket.emit("heartbeat:ack", { timestamp: new Date() });
    });

    registerChatEvents(socket, io);
    registerNotificationEvents(socket, io);
    registerPresenceEvents(socket, io);
  });

  const adminNamespace = io.of("/admin");
  adminNamespace.use(socketAuthMiddleware);
  adminNamespace.use(socketRoleMiddleware([RoleType.admin]));

  adminNamespace.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`Admin connected: ${socket.user?.email} (${socket.id})`);

    socket.on("error", (error: Error) => {
      socketErrorHandler(error, socket);
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`Admin disconnected: ${socket.id}, reason: ${reason}`);
    });

    registerAdminEvents(socket, adminNamespace);
  });

  // Set the global Socket.IO instance for notifications
  setSocketIOInstance(io);

  console.log(
    "✓ Socket.IO server initialized with multiplexing and authentication"
  );

  return io;
};

export const emitToUser = (
  io: SocketServer,
  userId: string,
  event: string,
  data: any,
  acknowledgement?: boolean
) => {
  if (acknowledgement) {
    io.to(`user:${userId}`)
      .timeout(5000)
      .emit(event, data, (err: any, responses: any) => {
        if (err) {
          console.error(`Failed to send ${event} to user ${userId}:`, err);
        } else {
          console.log(
            `Acknowledgement received for ${event} from user ${userId}:`,
            responses
          );
        }
      });
  } else {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const broadcastToAllUsers = (
  io: SocketServer,
  event: string,
  data: any
) => {
  io.emit(event, data);
};

export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId);
};

export const getUserTabCount = (userId: string): number => {
  const user = connectedUsers.get(userId);
  return user ? user.tabs.size : 0;
};

export const getOnlineUsers = (): string[] => {
  return Array.from(connectedUsers.keys());
};

export const getOnlineUsersCount = (): number => {
  return connectedUsers.size;
};

export default initializeSocketServer;
