// @ts-nocheck
import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import userModel, { RoleType } from "../../db/model/user.model.js";

export interface AuthenticatedSocket extends Socket {
  user?: {
    _id: Types.ObjectId;
    email: string;
    role: RoleType;
    userName?: string;
    fName: string;
    lName: string;
  };
  userId?: string;
}

export const socketAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.SIGNATURE_LOGIN_TOKEN!);
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }

    // @ts-ignore - Mongoose model conditional export creates union type incompatibility
    const user: any = await userModel
      .findOne({ _id: decoded.id })
      .select("email role userName fName lName isFrozen isDeleted")
      .exec();

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    if (user.isFrozen) {
      return next(
        new Error(
          "Authentication error: Account is frozen, please contact support"
        )
      );
    }

    if (user.isDeleted) {
      return next(new Error("Authentication error: Account has been deleted"));
    }

    socket.user = {
      _id: user._id,
      email: user.email,
      role: user.role,
      userName: user.userName,
      fName: user.fName,
      lName: user.lName,
    };
    socket.userId = user._id.toString();

    console.log(
      `Socket authenticated: ${user.email} (${user._id}) from ${socket.handshake.address}`
    );

    next();
  } catch (error: any) {
    console.error("Socket authentication error:", error);
    next(new Error(`Authentication error: ${error.message}`));
  }
};

export const socketRoleMiddleware = (allowedRoles: RoleType[]) => {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.user) {
      return next(new Error("Authorization error: User not authenticated"));
    }

    if (!allowedRoles.includes(socket.user.role)) {
      return next(
        new Error(
          `Authorization error: Insufficient permissions. Required roles: ${allowedRoles.join(
            ", "
          )}`
        )
      );
    }

    next();
  };
};
