// @ts-nocheck
import { Server as SocketServer } from "socket.io";
import { AuthenticatedSocket } from "../middleware/auth.middleware.js";
import { emitToUser, getSocketIOInstance } from "../server.js";
import { Types } from "mongoose";
import { MessageRepository } from "../../db/repositories/message.repository.js";
import { ConversationRepository } from "../../db/repositories/conversation.repository.js";
import { MessageType, MessageStatus } from "../../db/model/message.model.js";

const messageRepo = new MessageRepository();
const conversationRepo = new ConversationRepository();

interface ChatMessage {
  from: string;
  to: string;
  content: string;
  type: "text" | "image" | "file";
  timestamp: Date;
}

interface TypingData {
  userId: string;
  isTyping: boolean;
}

export const registerChatEvents = (
  socket: AuthenticatedSocket,
  io: SocketServer
) => {
  // Send message with database persistence
  socket.on(
    "chat:send_message",
    async (
      data: {
        conversationId: string;
        content: string;
        messageType?: string;
        replyTo?: string;
        fileUrl?: string;
        fileKey?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        location?: {
          latitude: number;
          longitude: number;
          address?: string;
        };
      },
      callback
    ) => {
      try {
        const { conversationId, content, messageType = "text", ...rest } = data;

        if (!conversationId || !content) {
          if (callback) {
            callback({
              success: false,
              error: "Conversation ID and content are required",
            });
          }
          return;
        }

        // Check if user is participant
        const isParticipant = await conversationRepo.isParticipant(
          conversationId,
          socket.userId!
        );

        if (!isParticipant) {
          if (callback) {
            callback({
              success: false,
              error: "You are not a participant of this conversation",
            });
          }
          return;
        }

        // Create message in database
        const message = await messageRepo.create({
          conversation: new Types.ObjectId(conversationId),
          sender: new Types.ObjectId(socket.userId!),
          content,
          messageType: messageType as MessageType,
          replyTo: rest.replyTo ? new Types.ObjectId(rest.replyTo) : undefined,
          fileUrl: rest.fileUrl,
          fileKey: rest.fileKey,
          fileName: rest.fileName,
          fileSize: rest.fileSize,
          mimeType: rest.mimeType,
          location: rest.location,
          status: MessageStatus.sent,
          deliveredTo: [],
          readBy: [],
          isEdited: false,
          isForwarded: false,
          isDeleted: false,
          deletedFor: [],
        });

        // Populate sender and reply
        const populatedMessage = await messageRepo.findById(
          message._id.toString(),
          {
            populateSender: true,
            populateReplyTo: true,
          }
        );

        // Get conversation to emit to all participants
        const conversation = await conversationRepo.findById(conversationId);

        if (conversation) {
          // Emit to all participants except sender
          conversation.participants.forEach((participantId) => {
            const participantIdStr = participantId.toString();
            if (participantIdStr !== socket.userId) {
              emitToUser(io, participantIdStr, "chat:new_message", {
                message: populatedMessage,
                conversationId,
              });
            }
          });
        }

        // Send confirmation to sender
        socket.emit("chat:message_sent", {
          success: true,
          message: populatedMessage,
        });

        if (callback) {
          callback({
            success: true,
            message: populatedMessage,
          });
        }

        console.log(
          `Message sent from ${socket.userId} in conversation ${conversationId}`
        );
      } catch (error: any) {
        console.error("Error sending message:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );

  // Typing indicator
  socket.on(
    "chat:typing",
    async (data: { conversationId: string; isTyping: boolean }) => {
      try {
        const { conversationId, isTyping } = data;

        if (!conversationId) return;

        // Check if user is participant
        const isParticipant = await conversationRepo.isParticipant(
          conversationId,
          socket.userId!
        );

        if (!isParticipant) return;

        // Get conversation to emit to all participants
        const conversation = await conversationRepo.findById(conversationId);

        if (conversation) {
          conversation.participants.forEach((participantId) => {
            const participantIdStr = participantId.toString();
            if (participantIdStr !== socket.userId) {
              emitToUser(io, participantIdStr, "chat:user_typing", {
                conversationId,
                userId: socket.userId!,
                userName: `${socket.user!.fName} ${socket.user!.lName}`,
                isTyping,
              });
            }
          });
        }
      } catch (error: any) {
        console.error("Error handling typing indicator:", error);
      }
    }
  );

  // Message delivered
  socket.on(
    "chat:message_delivered",
    async (data: { messageId: string }, callback) => {
      try {
        const { messageId } = data;

        const message = await messageRepo.markAsDelivered(
          messageId,
          socket.userId!
        );

        if (message) {
          // Notify sender
          emitToUser(io, message.sender.toString(), "chat:message_delivered", {
            messageId,
            deliveredBy: socket.userId!,
            deliveredAt: new Date(),
          });
        }

        if (callback) {
          callback({ success: true });
        }

        console.log(`Message ${messageId} delivered to ${socket.userId}`);
      } catch (error: any) {
        console.error("Error marking message as delivered:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Message read
  socket.on(
    "chat:message_read",
    async (data: { messageId: string }, callback) => {
      try {
        const { messageId } = data;

        const message = await messageRepo.markAsRead(messageId, socket.userId!);

        if (message) {
          // Notify sender
          emitToUser(
            io,
            message.sender.toString(),
            "chat:message_read_receipt",
            {
              messageId,
              readBy: socket.userId!,
              readAt: new Date(),
            }
          );
        }

        if (callback) {
          callback({ success: true });
        }

        console.log(`Message ${messageId} read by ${socket.userId}`);
      } catch (error: any) {
        console.error("Error marking message as read:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Mark conversation as read
  socket.on(
    "chat:mark_conversation_read",
    async (data: { conversationId: string }, callback) => {
      try {
        const { conversationId } = data;

        const count = await messageRepo.markConversationAsRead(
          conversationId,
          socket.userId!
        );

        // Notify other participants
        const conversation = await conversationRepo.findById(conversationId);

        if (conversation) {
          conversation.participants.forEach((participantId) => {
            const participantIdStr = participantId.toString();
            if (participantIdStr !== socket.userId) {
              emitToUser(io, participantIdStr, "chat:messages_read", {
                conversationId,
                userId: socket.userId,
                readBy: {
                  _id: socket.user!._id,
                  name: `${socket.user!.fName} ${socket.user!.lName}`,
                },
              });
            }
          });
        }

        if (callback) {
          callback({ success: true, count });
        }

        console.log(
          `${count} messages marked as read in conversation ${conversationId}`
        );
      } catch (error: any) {
        console.error("Error marking conversation as read:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Get conversation messages (pagination support)
  socket.on(
    "chat:get_messages",
    async (
      data: {
        conversationId: string;
        page?: number;
        limit?: number;
        beforeDate?: string;
      },
      callback
    ) => {
      try {
        const { conversationId, page = 1, limit = 50, beforeDate } = data;

        // Check if user is participant
        const isParticipant = await conversationRepo.isParticipant(
          conversationId,
          socket.userId!
        );

        if (!isParticipant) {
          if (callback) {
            callback({
              success: false,
              error: "You are not a participant of this conversation",
            });
          }
          return;
        }

        const result = await messageRepo.getConversationMessages(
          conversationId,
          socket.userId!,
          {
            page,
            limit,
            beforeDate: beforeDate ? new Date(beforeDate) : undefined,
            populateSender: true,
            populateReplyTo: true,
          }
        );

        if (callback) {
          callback({
            success: true,
            messages: result.data,
            pagination: {
              page: result.page,
              limit: result.limit,
              total: result.total,
              hasMore: result.hasMore,
            },
          });
        }
      } catch (error: any) {
        console.error("Error fetching messages:", error);
        if (callback) {
          callback({
            success: false,
            error: error.message,
          });
        }
      }
    }
  );

  // Join conversation room
  socket.on(
    "chat:join_room",
    async (data: { conversationId: string }, callback) => {
      try {
        const { conversationId } = data;

        // Check if user is participant
        const isParticipant = await conversationRepo.isParticipant(
          conversationId,
          socket.userId!
        );

        if (!isParticipant) {
          if (callback) {
            callback({
              success: false,
              error: "You are not a participant of this conversation",
            });
          }
          return;
        }

        // Join the room
        socket.join(`conversation:${conversationId}`);

        if (callback) {
          callback({
            success: true,
            message: "Joined conversation room",
          });
        }

        console.log(
          `User ${socket.userId} joined conversation room ${conversationId}`
        );
      } catch (error: any) {
        console.error("Error joining conversation room:", error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Leave conversation room
  socket.on("chat:leave_room", (data: { conversationId: string }, callback) => {
    try {
      const { conversationId } = data;

      socket.leave(`conversation:${conversationId}`);

      if (callback) {
        callback({
          success: true,
          message: "Left conversation room",
        });
      }

      console.log(
        `User ${socket.userId} left conversation room ${conversationId}`
      );
    } catch (error: any) {
      console.error("Error leaving conversation room:", error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Get unread count
  socket.on("chat:get_unread_count", async (callback) => {
    try {
      const totalUnread = await messageRepo.getTotalUnreadCount(socket.userId!);

      if (callback) {
        callback({
          success: true,
          unreadCount: totalUnread,
        });
      }
    } catch (error: any) {
      console.error("Error getting unread count:", error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });
};
