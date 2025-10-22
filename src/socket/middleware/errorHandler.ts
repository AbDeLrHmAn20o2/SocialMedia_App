import { Socket } from "socket.io";
import { AuthenticatedSocket } from "./auth.middleware.js";

export interface SocketError extends Error {
  statusCode?: number;
  data?: any;
}

export const socketErrorHandler = (
  error: SocketError,
  socket: AuthenticatedSocket
) => {
  console.error("Socket error:", {
    error: error.message,
    stack: error.stack,
    user: socket.user?._id,
    socketId: socket.id,
  });

  socket.emit("error", {
    success: false,
    error: error.message || "An error occurred",
    statusCode: error.statusCode || 500,
    data: error.data,
  });
};

export const createSocketError = (
  message: string,
  statusCode: number = 500,
  data?: any
): SocketError => {
  const error = new Error(message) as SocketError;
  error.statusCode = statusCode;
  error.data = data;
  return error;
};

export const wrapSocketHandler = (
  handler: (socket: AuthenticatedSocket, ...args: any[]) => Promise<void>
) => {
  return async (socket: AuthenticatedSocket, ...args: any[]) => {
    try {
      await handler(socket, ...args);
    } catch (error: any) {
      socketErrorHandler(error, socket);
    }
  };
};
