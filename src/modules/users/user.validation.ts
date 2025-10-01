import z from "zod";
import { GenderType } from "../../db/model/user.model.js";

export enum FlagType {
  all = "all",
  current = "current",
}

export const signInSchema = {
  body: z
    .strictObject({
      email: z.email(),
      password: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
    })
    .required(),
};
export const signUpSchema = {
  body: signInSchema.body
    .extend({
      userName: z.string().min(2).trim(),
      cPassword: z.string(),
      age: z.number().min(18).max(60),
      address: z.string(),
      phone: z.string(),
      gender: z.enum([GenderType.male, GenderType.female]),
    })
    .required()
    .refine(
      (data) => {
        return data.password === data.cPassword;
      },
      {
        error: "password dose not match",
        path: ["cPassword"],
      }
    ),
};

export const confirmEmailSchema = {
  body: z
    .strictObject({
      email: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};
export const logoutSchema = {
  body: z
    .strictObject({
      flag: z.enum(FlagType),
    })
    .required(),
};

export const updatePasswordSchema = {
  body: z
    .strictObject({
      currentPassword: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      newPassword: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      confirmPassword: z.string(),
    })
    .required()
    .refine(
      (data) => {
        return data.newPassword === data.confirmPassword;
      },
      {
        message: "new password does not match confirm password",
        path: ["confirmPassword"],
      }
    ),
};

export const updateBasicInfoSchema = {
  body: z
    .strictObject({
      fName: z.string().min(2).trim().optional(),
      lName: z.string().min(2).trim().optional(),
      age: z.number().min(18).max(60).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      gender: z.enum([GenderType.male, GenderType.female]).optional(),
    })
    .required(),
};

export const updateEmailSchema = {
  body: z
    .strictObject({
      newEmail: z.email(),
    })
    .required(),
};

export const confirmUpdateEmailSchema = {
  body: z
    .strictObject({
      newEmail: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export const likeUnlikeSchema = {
  body: z
    .strictObject({
      entityId: z.string(),
      entityType: z.string(),
    })
    .required(),
};

export const sendEmailTagsSchema = {
  body: z
    .strictObject({
      to: z.string().email(),
      subject: z.string().min(1),
      message: z.string().min(1),
      tags: z.record(z.string(), z.string()).optional(),
    })
    .required(),
};

export const enable2FASchema = {
  body: z.strictObject({}).required(),
};

export const verify2FASchema = {
  body: z
    .strictObject({
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export const loginConfirmationSchema = {
  body: z
    .strictObject({
      email: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export const googleAuthSchema = {
  body: z
    .strictObject({
      googleToken: z.string().min(1),
    })
    .required(),
};

export const forgotPasswordSchema = {
  body: z
    .strictObject({
      email: z.email(),
    })
    .required(),
};

export const resetPasswordSchema = {
  body: z
    .strictObject({
      email: z.email(),
      otp: z.string().min(6).max(6).trim(),
      newPassword: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      confirmPassword: z.string(),
    })
    .required()
    .refine(
      (data) => {
        return data.newPassword === data.confirmPassword;
      },
      {
        message: "new password does not match confirm password",
        path: ["confirmPassword"],
      }
    ),
};

export const presignedUploadUrlSchema = {
  body: z
    .strictObject({
      fileName: z.string().min(1),
      contentType: z.string().min(1),
      expiresIn: z.number().min(1).max(604800).optional(), // Max 7 days
    })
    .required(),
};

export const presignedDownloadUrlSchema = {
  body: z
    .strictObject({
      key: z.string().min(1),
      expiresIn: z.number().min(1).max(604800).optional(), // Max 7 days
    })
    .required(),
};

export const multiplePresignedUploadUrlsSchema = {
  body: z
    .strictObject({
      files: z
        .array(
          z.strictObject({
            fileName: z.string().min(1),
            contentType: z.string().min(1),
          })
        )
        .min(1)
        .max(10), // Max 10 files at once
      expiresIn: z.number().min(1).max(604800).optional(), // Max 7 days
    })
    .required(),
};

export const deleteFolderSchema = {
  body: z
    .strictObject({
      prefix: z.string().min(1),
    })
    .required(),
};

export const deleteMultipleFilesSchema = {
  body: z
    .strictObject({
      keys: z.array(z.string().min(1)).min(1).max(100), // Max 100 files at once
    })
    .required(),
};

export const updateProfileImageSchema = {
  body: z.strictObject({}).required(), // File will be in req.file
};

export const freezeAccountSchema = {
  body: z
    .strictObject({
      reason: z.string().min(1).optional(),
    })
    .required(),
};

export const adminFreezeAccountSchema = {
  body: z
    .strictObject({
      userId: z.string().min(1),
      reason: z.string().min(1).optional(),
    })
    .required(),
};

export const adminRestoreAccountSchema = {
  body: z
    .strictObject({
      userId: z.string().min(1),
    })
    .required(),
};

export const createPostSchema = {
  body: z
    .strictObject({
      title: z.string().min(3).max(200).trim(),
      content: z.string().min(10).max(5000),
      tags: z.array(z.string().trim().toLowerCase()).max(10).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      availability: z.enum(["public", "private", "friends"]).optional(),
    })
    .required(),
};

export const updatePostSchema = {
  body: z
    .strictObject({
      title: z.string().min(3).max(200).trim().optional(),
      content: z.string().min(10).max(5000).optional(),
      tags: z.array(z.string().trim().toLowerCase()).max(10).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      availability: z.enum(["public", "private", "friends"]).optional(),
    })
    .required(),
};

export const postReactionSchema = {
  body: z
    .strictObject({
      reactionType: z.enum(["like", "dislike"]),
    })
    .required(),
};

export const getPostsSchema = {
  query: z
    .strictObject({
      page: z
        .string()
        .transform((val) => parseInt(val))
        .optional(),
      limit: z
        .string()
        .transform((val) => parseInt(val))
        .optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
      availability: z.enum(["public", "private", "friends"]).optional(),
      author: z.string().optional(),
      tags: z.string().optional(), // Comma-separated tags
    })
    .optional(),
};

export type signInSchemaType = z.infer<typeof signInSchema.body>;
export type signUpSchemaType = z.infer<typeof signUpSchema.body>;
export type confirmEmailSchemaType = z.infer<typeof confirmEmailSchema.body>;
export type logoutSchema = z.infer<typeof logoutSchema.body>;
export type updatePasswordSchemaType = z.infer<
  typeof updatePasswordSchema.body
>;
export type updateBasicInfoSchemaType = z.infer<
  typeof updateBasicInfoSchema.body
>;
export type updateEmailSchemaType = z.infer<typeof updateEmailSchema.body>;
export type confirmUpdateEmailSchemaType = z.infer<
  typeof confirmUpdateEmailSchema.body
>;
export type likeUnlikeSchemaType = z.infer<typeof likeUnlikeSchema.body>;
export type sendEmailTagsSchemaType = z.infer<typeof sendEmailTagsSchema.body>;
export type enable2FASchemaType = z.infer<typeof enable2FASchema.body>;
export type verify2FASchemaType = z.infer<typeof verify2FASchema.body>;
export type loginConfirmationSchemaType = z.infer<
  typeof loginConfirmationSchema.body
>;
export type googleAuthSchemaType = z.infer<typeof googleAuthSchema.body>;
export type forgotPasswordSchemaType = z.infer<
  typeof forgotPasswordSchema.body
>;
export type resetPasswordSchemaType = z.infer<typeof resetPasswordSchema.body>;
export type presignedUploadUrlSchemaType = z.infer<
  typeof presignedUploadUrlSchema.body
>;
export type presignedDownloadUrlSchemaType = z.infer<
  typeof presignedDownloadUrlSchema.body
>;
export type multiplePresignedUploadUrlsSchemaType = z.infer<
  typeof multiplePresignedUploadUrlsSchema.body
>;
export type deleteFolderSchemaType = z.infer<typeof deleteFolderSchema.body>;
export type deleteMultipleFilesSchemaType = z.infer<
  typeof deleteMultipleFilesSchema.body
>;
export type updateProfileImageSchemaType = z.infer<
  typeof updateProfileImageSchema.body
>;
export type freezeAccountSchemaType = z.infer<typeof freezeAccountSchema.body>;
export type adminFreezeAccountSchemaType = z.infer<
  typeof adminFreezeAccountSchema.body
>;
export type adminRestoreAccountSchemaType = z.infer<
  typeof adminRestoreAccountSchema.body
>;
export type createPostSchemaType = z.infer<typeof createPostSchema.body>;
export type updatePostSchemaType = z.infer<typeof updatePostSchema.body>;
export type postReactionSchemaType = z.infer<typeof postReactionSchema.body>;
export type getPostsSchemaType = z.infer<typeof getPostsSchema.query>;

export const createCommentSchema = {
  body: z
    .strictObject({
      content: z
        .string()
        .min(1, "Comment content is required")
        .max(2000, "Comment cannot exceed 2000 characters")
        .trim(),
      commentOn: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid comment target ID"),
      commentOnModel: z.enum(["post", "comment"]),
      parentComment: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, "Invalid parent comment ID")
        .optional(),
    })
    .required(),
};

export const updateCommentSchema = {
  body: z
    .strictObject({
      content: z
        .string()
        .min(1, "Comment content is required")
        .max(2000, "Comment cannot exceed 2000 characters")
        .trim(),
    })
    .required(),
};

export const getCommentsSchema = {
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val <= 50, "Limit cannot exceed 50")
      .optional(),
    cursor: z.string().optional(),
    sortBy: z.enum(["createdAt", "likesCount", "repliesCount"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    depth: z.string().regex(/^\d+$/).transform(Number).optional(),
    maxDepth: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val <= 10, "Maximum depth cannot exceed 10")
      .optional(),
    author: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid author ID")
      .optional(),
    includeReplies: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    includeNestedReplies: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    populateAuthor: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    populateCommentOn: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  }),
};

export const commentReactionSchema = {
  body: z
    .strictObject({
      reactionType: z.enum(["like", "dislike"]),
    })
    .required(),
};

export const searchCommentsSchema = {
  query: z.object({
    q: z
      .string()
      .min(1, "Search query is required")
      .max(100, "Search query cannot exceed 100 characters")
      .trim(),
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((val) => val <= 50, "Limit cannot exceed 50")
      .optional(),
    sortBy: z.enum(["createdAt", "likesCount", "repliesCount"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
};

export type createCommentSchemaType = z.infer<typeof createCommentSchema.body>;
export type updateCommentSchemaType = z.infer<typeof updateCommentSchema.body>;
export type getCommentsSchemaType = z.infer<typeof getCommentsSchema.query>;
export type commentReactionSchemaType = z.infer<
  typeof commentReactionSchema.body
>;
export type searchCommentsSchemaType = z.infer<
  typeof searchCommentsSchema.query
>;

export const freezePostSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
      freezeDuration: z.number().min(1).max(365).optional(), // Duration in days
    })
    .optional()
    .default({}),
};

export const unfreezePostSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
    })
    .optional()
    .default({}),
};

export const freezeCommentSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
      freezeDuration: z.number().min(1).max(365).optional(), // Duration in days
    })
    .optional()
    .default({}),
};

export const unfreezeCommentSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
    })
    .optional()
    .default({}),
};

export const blockUserSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
    })
    .optional()
    .default({}),
};

export const unblockUserSchema = {
  body: z
    .strictObject({
      reason: z
        .string()
        .min(1, "Reason is required")
        .max(500, "Reason cannot exceed 500 characters")
        .trim()
        .optional(),
    })
    .optional()
    .default({}),
};

export const sendFriendRequestSchema = {
  body: z
    .strictObject({
      message: z
        .string()
        .max(200, "Message cannot exceed 200 characters")
        .trim()
        .optional(),
    })
    .optional()
    .default({}),
};

export const respondFriendRequestSchema = {
  body: z
    .strictObject({
      action: z.enum(["accept", "reject"]),
      message: z
        .string()
        .max(200, "Message cannot exceed 200 characters")
        .trim()
        .optional(),
    })
    .required(),
};

export const getEntityByIdSchema = {
  query: z.object({
    includeDeleted: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    includeFrozen: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    populateAll: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  }),
};

export type freezePostSchemaType = z.infer<typeof freezePostSchema.body>;
export type unfreezePostSchemaType = z.infer<typeof unfreezePostSchema.body>;
export type freezeCommentSchemaType = z.infer<typeof freezeCommentSchema.body>;
export type unfreezeCommentSchemaType = z.infer<
  typeof unfreezeCommentSchema.body
>;
export type blockUserSchemaType = z.infer<typeof blockUserSchema.body>;
export type unblockUserSchemaType = z.infer<typeof unblockUserSchema.body>;
export type sendFriendRequestSchemaType = z.infer<
  typeof sendFriendRequestSchema.body
>;
export type respondFriendRequestSchemaType = z.infer<
  typeof respondFriendRequestSchema.body
>;
export type getEntityByIdSchemaType = z.infer<typeof getEntityByIdSchema.query>;
