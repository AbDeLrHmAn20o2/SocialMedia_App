import { Router } from "express";
import chatService from "./chat.service.js";
import { authentication } from "../../middleware/Authentication.js";
import { validation } from "../../middleware/validation.js";
import * as CV from "./chat.validation.js";

const chatRouter = Router();

// ============ CONVERSATION ROUTES ============

// Create one-on-one chat
chatRouter.post(
  "/conversations/one-to-one",
  authentication(),
  validation(CV.createOneToOneChatSchema),
  chatService.createOneToOneChat
);

// Create group chat
chatRouter.post(
  "/conversations/group",
  authentication(),
  validation(CV.createGroupChatSchema),
  chatService.createGroupChat
);

// Get all user's conversations
chatRouter.get(
  "/conversations",
  authentication(),
  validation(CV.getConversationsSchema),
  chatService.getConversations
);

// Get conversation by ID
chatRouter.get(
  "/conversations/:conversationId",
  authentication(),
  chatService.getConversationById
);

// Update group chat details
chatRouter.patch(
  "/conversations/:conversationId",
  authentication(),
  validation(CV.updateGroupChatSchema),
  chatService.updateGroupChat
);

// Delete conversation (leave group or delete one-on-one)
chatRouter.delete(
  "/conversations/:conversationId",
  authentication(),
  chatService.deleteConversation
);

// Add participant to group
chatRouter.post(
  "/conversations/:conversationId/participants",
  authentication(),
  validation(CV.addParticipantSchema),
  chatService.addParticipant
);

// Remove participant from group
chatRouter.delete(
  "/conversations/:conversationId/participants",
  authentication(),
  validation(CV.removeParticipantSchema),
  chatService.removeParticipant
);

// Make user admin in group
chatRouter.post(
  "/conversations/:conversationId/admins",
  authentication(),
  validation(CV.makeAdminSchema),
  chatService.makeAdmin
);

// ============ MESSAGE ROUTES ============

// Send message (REST fallback - Socket.IO is primary)
chatRouter.post(
  "/conversations/:conversationId/messages",
  authentication(),
  validation(CV.sendMessageSchema),
  chatService.sendMessage
);

// Get messages in conversation
chatRouter.get(
  "/conversations/:conversationId/messages",
  authentication(),
  validation(CV.getMessagesSchema),
  chatService.getMessages
);

// Update message (edit)
chatRouter.patch(
  "/messages/:messageId",
  authentication(),
  validation(CV.updateMessageSchema),
  chatService.updateMessage
);

// Delete message
chatRouter.delete(
  "/messages/:messageId",
  authentication(),
  chatService.deleteMessage
);

// Mark conversation as read
chatRouter.post(
  "/conversations/:conversationId/read",
  authentication(),
  chatService.markAsRead
);

// Search messages in conversation
chatRouter.get(
  "/conversations/:conversationId/search",
  authentication(),
  validation(CV.searchMessagesSchema),
  chatService.searchMessages
);

// Get media messages in conversation
chatRouter.get(
  "/conversations/:conversationId/media",
  authentication(),
  chatService.getMediaMessages
);

// Forward message
chatRouter.post(
  "/messages/forward",
  authentication(),
  validation(CV.forwardMessageSchema),
  chatService.forwardMessage
);

// Get total unread count
chatRouter.get("/unread-count", authentication(), chatService.getUnreadCount);

// Get users and friends (for chat UI)
chatRouter.get(
  "/users-friends",
  authentication(),
  chatService.getUsersAndFriends
);

export default chatRouter;
