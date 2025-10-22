// @ts-nocheck
import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ConversationRepository } from "../../db/repositories/conversation.repository.js";
import { MessageRepository } from "../../db/repositories/message.repository.js";
import { FriendRequestRepository } from "../../db/repositories/friendRequest.repository.js";
import conversationModel, {
  ConversationType,
} from "../../db/model/conversation.model.js";
import messageModel, {
  MessageType,
  MessageStatus,
} from "../../db/model/message.model.js";
import friendRequestModel from "../../db/model/friendRequest.model.js";
import userModel from "../../db/model/user.model.js";
import { appError } from "../../utils/classError.js";
import {
  createOneToOneChatSchemaType,
  createGroupChatSchemaType,
  updateGroupChatSchemaType,
  addParticipantSchemaType,
  removeParticipantSchemaType,
  makeAdminSchemaType,
  getConversationsSchemaType,
  sendMessageSchemaType,
  updateMessageSchemaType,
  getMessagesSchemaType,
  searchMessagesSchemaType,
  forwardMessageSchemaType,
} from "./chat.validation.js";
import {
  sendNotificationToUser,
  NotificationType,
} from "../../socket/events/notification.events.js";
import { emitToUser, getSocketIOInstance } from "../../socket/server.js";

class ChatService {
  private _conversationRepo = new ConversationRepository();
  private _messageRepo = new MessageRepository();
  private _friendRequestRepo = new FriendRequestRepository();

  // ============ CONVERSATION METHODS ============

  // Create one-on-one chat
  createOneToOneChat = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { participantId }: createOneToOneChatSchemaType = req.body;
      const userId = req.user._id.toString();

      // Check if user is trying to chat with themselves
      if (participantId === userId) {
        return res.status(400).json({
          success: false,
          error: "Cannot create conversation with yourself",
        });
      }

      // Check if participant exists
      const participant = await userModel.findById(participantId);
      if (!participant) {
        return res.status(404).json({
          success: false,
          error: "Participant not found",
        });
      }

      // Check if conversation already exists
      const existingConversation =
        await this._conversationRepo.findOneToOneConversation(
          userId,
          participantId
        );

      if (existingConversation) {
        return res.json({
          success: true,
          conversation: existingConversation,
          message: "Conversation already exists",
        });
      }

      // Create new conversation
      const conversation = await this._conversationRepo.create({
        type: ConversationType.oneToOne,
        participants: [
          new Types.ObjectId(userId),
          new Types.ObjectId(participantId),
        ],
        isActive: true,
      });

      const populatedConversation = await this._conversationRepo.findById(
        conversation._id.toString(),
        { populateParticipants: true }
      );

      res.status(201).json({
        success: true,
        conversation: populatedConversation,
      });
    } catch (error) {
      next(error);
    }
  };

  // Create group chat
  createGroupChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, participantIds }: createGroupChatSchemaType =
        req.body;
      const userId = req.user._id.toString();

      // Add creator to participants if not included
      const allParticipants = new Set([userId, ...participantIds]);

      // Verify all participants exist
      const users = await userModel.find({
        _id: { $in: Array.from(allParticipants) },
      });

      if (users.length !== allParticipants.size) {
        return res.status(404).json({
          success: false,
          error: "One or more participants not found",
        });
      }

      // Create group conversation
      const conversation = await this._conversationRepo.create({
        type: ConversationType.group,
        name,
        description,
        participants: Array.from(allParticipants).map(
          (id) => new Types.ObjectId(id)
        ),
        admin: [new Types.ObjectId(userId)],
        isActive: true,
      });

      const populatedConversation = await this._conversationRepo.findById(
        conversation._id.toString(),
        { populateParticipants: true, populateAdmins: true }
      );

      // Notify all participants
      const io = getSocketIOInstance();
      if (io) {
        allParticipants.forEach((participantId) => {
          if (participantId !== userId) {
            emitToUser(io, participantId, "chat:group_created", {
              conversation: populatedConversation,
              createdBy: {
                _id: req.user._id,
                name: `${req.user.fName} ${req.user.lName}`,
              },
            });
          }
        });
      }

      res.status(201).json({
        success: true,
        conversation: populatedConversation,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get user's conversations
  getConversations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {
        page = 1,
        limit = 20,
        type,
      }: getConversationsSchemaType = req.query as any;
      const userId = req.user._id.toString();

      const result = await this._conversationRepo.getUserConversations(userId, {
        page,
        limit,
        type,
        populateParticipants: true,
      });

      // Add unread count for each conversation
      const conversationsWithUnread = await Promise.all(
        result.data.map(async (conversation) => {
          const unreadCount = await this._messageRepo.getUnreadCount(
            conversation._id.toString(),
            userId
          );

          return {
            ...conversation.toObject(),
            unreadCount,
          };
        })
      );

      res.json({
        success: true,
        conversations: conversationsWithUnread,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get conversation by ID
  getConversationById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      const conversation = await this._conversationRepo.findById(
        conversationId,
        {
          populateParticipants: true,
          populateAdmins: true,
        }
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Get unread count
      const unreadCount = await this._messageRepo.getUnreadCount(
        conversationId,
        userId
      );

      res.json({
        success: true,
        conversation: {
          ...conversation.toObject(),
          unreadCount,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Update group chat
  updateGroupChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const { name, description }: updateGroupChatSchemaType = req.body;
      const userId = req.user._id.toString();

      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Check if it's a group chat
      if (conversation.type !== ConversationType.group) {
        return res.status(400).json({
          success: false,
          error: "This operation is only for group chats",
        });
      }

      // Check if user is admin
      const isAdmin = await this._conversationRepo.isAdmin(
        conversationId,
        userId
      );

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only group admins can update group details",
        });
      }

      const updatedConversation = await this._conversationRepo.update(
        conversationId,
        { name, description }
      );

      // Notify all participants
      const io = getSocketIOInstance();
      if (io && updatedConversation) {
        updatedConversation.participants.forEach((participantId) => {
          emitToUser(io, participantId.toString(), "chat:group_updated", {
            conversationId,
            updates: { name, description },
            updatedBy: {
              _id: req.user._id,
              name: `${req.user.fName} ${req.user.lName}`,
            },
          });
        });
      }

      res.json({
        success: true,
        conversation: updatedConversation,
      });
    } catch (error) {
      next(error);
    }
  };

  // Add participant to group
  addParticipant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const { userId: newParticipantId }: addParticipantSchemaType = req.body;
      const userId = req.user._id.toString();

      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Check if it's a group chat
      if (conversation.type !== ConversationType.group) {
        return res.status(400).json({
          success: false,
          error: "This operation is only for group chats",
        });
      }

      // Check if user is admin
      const isAdmin = await this._conversationRepo.isAdmin(
        conversationId,
        userId
      );

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only group admins can add participants",
        });
      }

      // Check if new participant exists
      const newParticipant = await userModel.findById(newParticipantId);
      if (!newParticipant) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Check if already a participant
      const alreadyParticipant = conversation.participants.some(
        (p) => p.toString() === newParticipantId
      );

      if (alreadyParticipant) {
        return res.status(400).json({
          success: false,
          error: "User is already a participant",
        });
      }

      const updatedConversation = await this._conversationRepo.addParticipant(
        conversationId,
        newParticipantId
      );

      // Notify all participants
      const io = getSocketIOInstance();
      if (io && updatedConversation) {
        updatedConversation.participants.forEach((participantId) => {
          emitToUser(io, participantId.toString(), "chat:participant_added", {
            conversationId,
            participant: {
              _id: newParticipant._id,
              name: `${newParticipant.fName} ${newParticipant.lName}`,
            },
            addedBy: {
              _id: req.user._id,
              name: `${req.user.fName} ${req.user.lName}`,
            },
          });
        });
      }

      res.json({
        success: true,
        conversation: updatedConversation,
        message: "Participant added successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  // Remove participant from group
  removeParticipant = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { conversationId } = req.params;
      const { userId: participantToRemove }: removeParticipantSchemaType =
        req.body;
      const userId = req.user._id.toString();

      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Check if it's a group chat
      if (conversation.type !== ConversationType.group) {
        return res.status(400).json({
          success: false,
          error: "This operation is only for group chats",
        });
      }

      // Check if user is admin or removing themselves
      const isAdmin = await this._conversationRepo.isAdmin(
        conversationId,
        userId
      );
      const isSelf = participantToRemove === userId;

      if (!isAdmin && !isSelf) {
        return res.status(403).json({
          success: false,
          error: "Only group admins can remove participants",
        });
      }

      const updatedConversation =
        await this._conversationRepo.removeParticipant(
          conversationId,
          participantToRemove
        );

      // If user was admin, remove from admin list too
      const isRemovedUserAdmin = conversation.admin.some(
        (a) => a.toString() === participantToRemove
      );
      if (isRemovedUserAdmin) {
        await this._conversationRepo.removeAdmin(
          conversationId,
          participantToRemove
        );
      }

      // Notify all participants
      const io = getSocketIOInstance();
      if (io && updatedConversation) {
        updatedConversation.participants.forEach((participantId) => {
          emitToUser(io, participantId.toString(), "chat:participant_removed", {
            conversationId,
            removedUserId: participantToRemove,
            removedBy: {
              _id: req.user._id,
              name: `${req.user.fName} ${req.user.lName}`,
            },
            isSelf,
          });
        });
      }

      res.json({
        success: true,
        conversation: updatedConversation,
        message: isSelf
          ? "You left the group"
          : "Participant removed successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  // Make user admin
  makeAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const { userId: newAdminId }: makeAdminSchemaType = req.body;
      const userId = req.user._id.toString();

      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Check if it's a group chat
      if (conversation.type !== ConversationType.group) {
        return res.status(400).json({
          success: false,
          error: "This operation is only for group chats",
        });
      }

      // Check if user is admin
      const isAdmin = await this._conversationRepo.isAdmin(
        conversationId,
        userId
      );

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only group admins can promote participants",
        });
      }

      // Check if target is participant
      const isParticipant = conversation.participants.some(
        (p) => p.toString() === newAdminId
      );

      if (!isParticipant) {
        return res.status(400).json({
          success: false,
          error: "User is not a participant",
        });
      }

      // Check if already admin
      const alreadyAdmin = conversation.admin.some(
        (a) => a.toString() === newAdminId
      );

      if (alreadyAdmin) {
        return res.status(400).json({
          success: false,
          error: "User is already an admin",
        });
      }

      const updatedConversation = await this._conversationRepo.addAdmin(
        conversationId,
        newAdminId
      );

      // Notify all participants
      const io = getSocketIOInstance();
      if (io && updatedConversation) {
        updatedConversation.participants.forEach((participantId) => {
          emitToUser(io, participantId.toString(), "chat:admin_added", {
            conversationId,
            newAdminId,
            promotedBy: {
              _id: req.user._id,
              name: `${req.user.fName} ${req.user.lName}`,
            },
          });
        });
      }

      res.json({
        success: true,
        conversation: updatedConversation,
        message: "User promoted to admin successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete conversation (leave group or delete one-on-one)
  deleteConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id.toString();

      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      if (conversation.type === ConversationType.group) {
        // Remove user from group
        await this._conversationRepo.removeParticipant(conversationId, userId);

        // If user was admin, remove from admin list
        const isAdmin = await this._conversationRepo.isAdmin(
          conversationId,
          userId
        );
        if (isAdmin) {
          await this._conversationRepo.removeAdmin(conversationId, userId);
        }

        res.json({
          success: true,
          message: "You left the group successfully",
        });
      } else {
        // For one-on-one, just deactivate
        await this._conversationRepo.deactivate(conversationId);

        res.json({
          success: true,
          message: "Conversation deleted successfully",
        });
      }
    } catch (error) {
      next(error);
    }
  };

  // ============ MESSAGE METHODS ============

  // Send message (REST endpoint - for initial send, Socket.IO is primary)
  sendMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const messageData: sendMessageSchemaType = req.body;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      // Create message
      const message = await this._messageRepo.create({
        conversation: new Types.ObjectId(conversationId),
        sender: new Types.ObjectId(userId),
        content: messageData.content,
        messageType: messageData.messageType || MessageType.text,
        replyTo: messageData.replyTo
          ? new Types.ObjectId(messageData.replyTo)
          : undefined,
        fileUrl: messageData.fileUrl,
        fileKey: messageData.fileKey,
        fileName: messageData.fileName,
        fileSize: messageData.fileSize,
        mimeType: messageData.mimeType,
        location: messageData.location,
        status: MessageStatus.sent,
        deliveredTo: [],
        readBy: [],
        isEdited: false,
        isForwarded: false,
        isDeleted: false,
        deletedFor: [],
      });

      const populatedMessage = await this._messageRepo.findById(
        message._id.toString(),
        {
          populateSender: true,
          populateReplyTo: true,
        }
      );

      // Get conversation to notify participants
      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      // Emit to all participants via Socket.IO
      const io = getSocketIOInstance();
      if (io && conversation) {
        conversation.participants.forEach((participantId) => {
          const participantIdStr = participantId.toString();
          if (participantIdStr !== userId) {
            emitToUser(io, participantIdStr, "chat:new_message", {
              message: populatedMessage,
              conversationId,
            });
          }
        });
      }

      res.status(201).json({
        success: true,
        message: populatedMessage,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get messages in conversation
  getMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const {
        page = 1,
        limit = 50,
        beforeDate,
        afterDate,
        messageType,
      }: getMessagesSchemaType = req.query as any;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      const result = await this._messageRepo.getConversationMessages(
        conversationId,
        userId,
        {
          page,
          limit,
          beforeDate: beforeDate ? new Date(beforeDate) : undefined,
          afterDate: afterDate ? new Date(afterDate) : undefined,
          messageType,
          populateSender: true,
          populateReplyTo: true,
        }
      );

      res.json({
        success: true,
        messages: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Update message (edit)
  updateMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = req.params;
      const { content }: updateMessageSchemaType = req.body;
      const userId = req.user._id.toString();

      const message = await this._messageRepo.findById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: "Message not found",
        });
      }

      // Check if user is the sender
      if (message.sender.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: "You can only edit your own messages",
        });
      }

      // Can only edit text messages
      if (message.messageType !== MessageType.text) {
        return res.status(400).json({
          success: false,
          error: "Only text messages can be edited",
        });
      }

      const updatedMessage = await this._messageRepo.update(messageId, {
        content,
      });

      // Notify participants
      const conversation = await this._conversationRepo.findById(
        message.conversation.toString()
      );

      const io = getSocketIOInstance();
      if (io && conversation) {
        conversation.participants.forEach((participantId) => {
          emitToUser(io, participantId.toString(), "chat:message_updated", {
            messageId,
            conversationId: message.conversation.toString(),
            content,
            editedAt: updatedMessage?.editedAt,
          });
        });
      }

      res.json({
        success: true,
        message: updatedMessage,
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete message
  deleteMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = req.params;
      const { forEveryone } = req.query;
      const userId = req.user._id.toString();

      const message = await this._messageRepo.findById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: "Message not found",
        });
      }

      // Check if user is the sender
      if (message.sender.toString() !== userId) {
        return res.status(403).json({
          success: false,
          error: "You can only delete your own messages",
        });
      }

      let deletedMessage;

      if (forEveryone === "true") {
        // Delete for everyone
        deletedMessage = await this._messageRepo.deleteForEveryone(messageId);

        // Notify participants
        const conversation = await this._conversationRepo.findById(
          message.conversation.toString()
        );

        const io = getSocketIOInstance();
        if (io && conversation) {
          conversation.participants.forEach((participantId) => {
            emitToUser(io, participantId.toString(), "chat:message_deleted", {
              messageId,
              conversationId: message.conversation.toString(),
              forEveryone: true,
            });
          });
        }
      } else {
        // Delete for user only
        deletedMessage = await this._messageRepo.deleteForUser(
          messageId,
          userId
        );
      }

      res.json({
        success: true,
        message: "Message deleted successfully",
        deletedMessage,
      });
    } catch (error) {
      next(error);
    }
  };

  // Mark conversation as read
  markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      const count = await this._messageRepo.markConversationAsRead(
        conversationId,
        userId
      );

      // Notify other participants
      const conversation = await this._conversationRepo.findById(
        conversationId
      );

      const io = getSocketIOInstance();
      if (io && conversation) {
        conversation.participants.forEach((participantId) => {
          const participantIdStr = participantId.toString();
          if (participantIdStr !== userId) {
            emitToUser(io, participantIdStr, "chat:messages_read", {
              conversationId,
              userId,
              readBy: {
                _id: req.user._id,
                name: `${req.user.fName} ${req.user.lName}`,
              },
            });
          }
        });
      }

      res.json({
        success: true,
        message: "Messages marked as read",
        count,
      });
    } catch (error) {
      next(error);
    }
  };

  // Search messages in conversation
  searchMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const {
        query,
        page = 1,
        limit = 20,
      }: searchMessagesSchemaType = req.query as any;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      const result = await this._messageRepo.searchInConversation(
        conversationId,
        query,
        userId,
        {
          page,
          limit,
        }
      );

      res.json({
        success: true,
        messages: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get media messages
  getMediaMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 20, messageType } = req.query as any;
      const userId = req.user._id.toString();

      // Check if user is participant
      const isParticipant = await this._conversationRepo.isParticipant(
        conversationId,
        userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You are not a participant of this conversation",
        });
      }

      const result = await this._messageRepo.getMediaMessages(
        conversationId,
        userId,
        {
          page,
          limit,
          messageType,
        }
      );

      res.json({
        success: true,
        media: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Forward message
  forwardMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId, conversationIds }: forwardMessageSchemaType = req.body;
      const userId = req.user._id.toString();

      const originalMessage = await this._messageRepo.findById(messageId);

      if (!originalMessage) {
        return res.status(404).json({
          success: false,
          error: "Message not found",
        });
      }

      // Verify user can access original message
      const originalConversation = await this._conversationRepo.findById(
        originalMessage.conversation.toString()
      );

      if (!originalConversation) {
        return res.status(404).json({
          success: false,
          error: "Original conversation not found",
        });
      }

      const isParticipant = originalConversation.participants.some(
        (p) => p.toString() === userId
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: "You cannot access this message",
        });
      }

      // Forward to each conversation
      const forwardedMessages = [];

      for (const conversationId of conversationIds) {
        // Check if user is participant in target conversation
        const targetIsParticipant = await this._conversationRepo.isParticipant(
          conversationId,
          userId
        );

        if (!targetIsParticipant) {
          continue; // Skip this conversation
        }

        // Create forwarded message
        const forwardedMessage = await this._messageRepo.create({
          conversation: new Types.ObjectId(conversationId),
          sender: new Types.ObjectId(userId),
          content: originalMessage.content,
          messageType: originalMessage.messageType,
          fileUrl: originalMessage.fileUrl,
          fileKey: originalMessage.fileKey,
          fileName: originalMessage.fileName,
          fileSize: originalMessage.fileSize,
          mimeType: originalMessage.mimeType,
          location: originalMessage.location,
          isForwarded: true,
          status: MessageStatus.sent,
          deliveredTo: [],
          readBy: [],
          isEdited: false,
          isDeleted: false,
          deletedFor: [],
        });

        forwardedMessages.push(forwardedMessage);

        // Notify participants of target conversation
        const targetConversation = await this._conversationRepo.findById(
          conversationId
        );

        const io = getSocketIOInstance();
        if (io && targetConversation) {
          targetConversation.participants.forEach((participantId) => {
            const participantIdStr = participantId.toString();
            if (participantIdStr !== userId) {
              emitToUser(io, participantIdStr, "chat:new_message", {
                message: forwardedMessage,
                conversationId,
              });
            }
          });
        }
      }

      res.json({
        success: true,
        message: "Message forwarded successfully",
        forwardedCount: forwardedMessages.length,
        forwardedMessages,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get unread count
  getUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user._id.toString();

      const totalUnread = await this._messageRepo.getTotalUnreadCount(userId);

      res.json({
        success: true,
        unreadCount: totalUnread,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get user info and friends for chat (useful for frontend)
  getUsersAndFriends = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = req.user._id.toString();

      // Get friends list
      const friendsResult = await this._friendRequestRepo.getFriends(userId, {
        page: 1,
        limit: 1000, // Get all friends
      });

      res.json({
        success: true,
        friends: friendsResult.data,
        total: friendsResult.total,
      });
    } catch (error) {
      next(error);
    }
  };
}

const chatService = new ChatService();
export default chatService;
