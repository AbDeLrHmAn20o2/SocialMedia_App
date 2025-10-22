import { z } from "zod";
import { Types } from "mongoose";

// ============ CONVERSATION VALIDATION ============

export const createOneToOneChatSchema = {
  body: z
    .strictObject({
      participantId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid participant ID"),
    })
    .required(),
};

export const createGroupChatSchema = {
  body: z
    .strictObject({
      name: z
        .string()
        .min(1, "Group name is required")
        .max(100, "Group name cannot exceed 100 characters")
        .trim(),
      description: z
        .string()
        .max(500, "Description cannot exceed 500 characters")
        .trim()
        .optional(),
      participantIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid participant ID"))
        .min(1, "At least one participant is required")
        .max(50, "Maximum 50 participants allowed"),
    })
    .required(),
};

export const updateGroupChatSchema = {
  body: z
    .strictObject({
      name: z
        .string()
        .min(1, "Group name is required")
        .max(100, "Group name cannot exceed 100 characters")
        .trim()
        .optional(),
      description: z
        .string()
        .max(500, "Description cannot exceed 500 characters")
        .trim()
        .optional(),
    })
    .required(),
};

export const addParticipantSchema = {
  body: z
    .strictObject({
      userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
    })
    .required(),
};

export const removeParticipantSchema = {
  body: z
    .strictObject({
      userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
    })
    .required(),
};

export const makeAdminSchema = {
  body: z
    .strictObject({
      userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
    })
    .required(),
};

export const getConversationsSchema = {
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val >= 1 && val <= 100, {
        message: "Limit must be between 1 and 100",
      })
      .optional(),
    type: z.enum(["oneToOne", "group"]).optional(),
  }),
};

// ============ MESSAGE VALIDATION ============

export const sendMessageSchema = {
  body: z
    .strictObject({
      content: z
        .string()
        .min(1, "Message content is required")
        .max(10000, "Message cannot exceed 10000 characters")
        .trim(),
      messageType: z
        .enum(["text", "image", "video", "file", "audio", "location"])
        .optional()
        .default("text"),
      replyTo: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid message ID")
        .optional(),
      // File info for non-text messages
      fileUrl: z.string().url().optional(),
      fileKey: z.string().optional(),
      fileName: z.string().optional(),
      fileSize: z.number().min(0).optional(),
      mimeType: z.string().optional(),
      // Location data
      location: z
        .strictObject({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          address: z.string().optional(),
        })
        .optional(),
    })
    .required(),
};

export const updateMessageSchema = {
  body: z
    .strictObject({
      content: z
        .string()
        .min(1, "Message content is required")
        .max(10000, "Message cannot exceed 10000 characters")
        .trim(),
    })
    .required(),
};

export const getMessagesSchema = {
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val >= 1 && val <= 100, {
        message: "Limit must be between 1 and 100",
      })
      .optional(),
    beforeDate: z.string().datetime().optional(),
    afterDate: z.string().datetime().optional(),
    messageType: z
      .enum(["text", "image", "video", "file", "audio", "location"])
      .optional(),
  }),
};

export const searchMessagesSchema = {
  query: z.object({
    query: z.string().min(1).max(200),
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
};

export const forwardMessageSchema = {
  body: z
    .strictObject({
      messageId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid message ID"),
      conversationIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation ID"))
        .min(1, "At least one conversation is required")
        .max(10, "Maximum 10 conversations allowed"),
    })
    .required(),
};

// ============ TYPE EXPORTS ============

export type createOneToOneChatSchemaType = z.infer<
  typeof createOneToOneChatSchema.body
>;
export type createGroupChatSchemaType = z.infer<
  typeof createGroupChatSchema.body
>;
export type updateGroupChatSchemaType = z.infer<
  typeof updateGroupChatSchema.body
>;
export type addParticipantSchemaType = z.infer<
  typeof addParticipantSchema.body
>;
export type removeParticipantSchemaType = z.infer<
  typeof removeParticipantSchema.body
>;
export type makeAdminSchemaType = z.infer<typeof makeAdminSchema.body>;
export type getConversationsSchemaType = z.infer<
  typeof getConversationsSchema.query
>;

export type sendMessageSchemaType = z.infer<typeof sendMessageSchema.body>;
export type updateMessageSchemaType = z.infer<typeof updateMessageSchema.body>;
export type getMessagesSchemaType = z.infer<typeof getMessagesSchema.query>;
export type searchMessagesSchemaType = z.infer<
  typeof searchMessagesSchema.query
>;
export type forwardMessageSchemaType = z.infer<
  typeof forwardMessageSchema.body
>;
