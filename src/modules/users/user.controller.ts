import { Router } from "express";
import US from "./user.service.js";
import * as UV from "./user.validation.js";
import { validation } from "../../middleware/validation.js";
import { authentication } from "../../middleware/Authentication.js";
import { TokenType } from "../../utils/token.js";

const userRouter = Router();

userRouter.post("/signup", validation(UV.signUpSchema), US.signUp);
userRouter.patch(
  "/confirmEmail",
  validation(UV.confirmEmailSchema),
  US.confirmEmail
);
userRouter.post("/signIn", validation(UV.signInSchema), US.signIn);
userRouter.get("/profile", authentication(), US.getProfile);
userRouter.get(
  "/refreshToken",
  authentication(TokenType.refresh),
  US.refreshToken
);
userRouter.post(
  "/logout",
  authentication(),
  validation(UV.logoutSchema),
  US.logout
);

userRouter.patch(
  "/updatePassword",
  authentication(),
  validation(UV.updatePasswordSchema),
  US.updatePassword
);
userRouter.patch(
  "/updateBasicInfo",
  authentication(),
  validation(UV.updateBasicInfoSchema),
  US.updateBasicInfo
);
userRouter.patch(
  "/updateEmail",
  authentication(),
  validation(UV.updateEmailSchema),
  US.updateEmail
);
userRouter.patch(
  "/confirmUpdateEmail",
  authentication(),
  validation(UV.confirmUpdateEmailSchema),
  US.confirmUpdateEmail
);
userRouter.post(
  "/likeUnlike",
  authentication(),
  validation(UV.likeUnlikeSchema),
  US.likeUnlike
);
userRouter.post(
  "/sendEmail",
  authentication(),
  validation(UV.sendEmailTagsSchema),
  US.sendEmailTags
);
userRouter.post(
  "/enable2FA",
  authentication(),
  validation(UV.enable2FASchema),
  US.enable2FA
);
userRouter.post(
  "/verify2FA",
  authentication(),
  validation(UV.verify2FASchema),
  US.verify2FA
);
userRouter.post(
  "/loginConfirmation",
  validation(UV.loginConfirmationSchema),
  US.loginConfirmation
);
userRouter.post(
  "/forgotPassword",
  validation(UV.forgotPasswordSchema),
  US.forgotPassword
);
userRouter.post(
  "/resetPassword",
  validation(UV.resetPasswordSchema),
  US.resetPassword
);
userRouter.post("/googleAuth", validation(UV.googleAuthSchema), US.googleAuth);

userRouter.post("/upload", US.upload.any(), US.uploadFiles);

userRouter.post(
  "/presigned-upload-url",
  validation(UV.presignedUploadUrlSchema),
  US.getPresignedUploadUrl
);
userRouter.post(
  "/presigned-download-url",
  validation(UV.presignedDownloadUrlSchema),
  US.getPresignedDownloadUrl
);
userRouter.post(
  "/multiple-presigned-upload-urls",
  validation(UV.multiplePresignedUploadUrlsSchema),
  US.getMultiplePresignedUploadUrls
);

// File management routes
userRouter.get("/files/:key(*)", US.getFileInfo); // Get file metadata
userRouter.get("/download/:key(*)", US.downloadFile); // Download file
userRouter.get("/files", US.listFiles); // List files (with optional ?prefix=folder/)
userRouter.delete(
  "/folder",
  validation(UV.deleteFolderSchema),
  US.deleteFolder
); // Delete folder by prefix
userRouter.delete("/files/:key(*)", US.deleteFile); // Delete single file
userRouter.delete(
  "/files",
  validation(UV.deleteMultipleFilesSchema),
  US.deleteMultipleFiles
); // Delete multiple files
userRouter.get("/signed-url/:key(*)", US.getFileWithSignedUrl); // Get file with signed URL

// Profile image management
userRouter.patch(
  "/profile-image",
  authentication(),
  US.upload.single("profileImage"),
  US.updateProfileImage
);

// Account management - User actions
userRouter.patch(
  "/freeze-account",
  authentication(),
  validation(UV.freezeAccountSchema),
  US.freezeAccount
);
userRouter.patch("/restore-account", authentication(), US.restoreAccount);

// Account management - Admin actions (require admin role)
userRouter.patch(
  "/admin/freeze-account",
  authentication(),
  validation(UV.adminFreezeAccountSchema),
  US.adminFreezeAccount
);
userRouter.patch(
  "/admin/restore-account",
  authentication(),
  validation(UV.adminRestoreAccountSchema),
  US.adminRestoreAccount
);

// Post management routes
userRouter.post(
  "/posts",
  authentication(),
  US.upload.array("images", 10),
  validation(UV.createPostSchema),
  US.createPost
);
userRouter.get("/posts", authentication(), US.getPosts);
userRouter.get("/posts/:postId", authentication(), US.getPost);
userRouter.patch(
  "/posts/:postId",
  authentication(),
  US.upload.array("images", 10),
  validation(UV.updatePostSchema),
  US.updatePost
);
userRouter.delete("/posts/:postId", authentication(), US.deletePost);
userRouter.post(
  "/posts/:postId/react",
  authentication(),
  validation(UV.postReactionSchema),
  US.reactToPost
);
userRouter.get(
  "/posts/:postId/reactions",
  authentication(),
  US.getPostReactions
);

// Comment management routes
userRouter.post(
  "/comments",
  authentication(),
  validation(UV.createCommentSchema),
  US.createComment
);
userRouter.get("/comments", authentication(), US.getComments);
userRouter.get("/posts/:postId/comments", authentication(), US.getRootComments);
userRouter.get("/comments/:commentId", authentication(), US.getCommentById);
userRouter.get("/comments/:commentId/replies", authentication(), US.getReplies);
userRouter.get(
  "/comments/:commentId/nested",
  authentication(),
  US.getNestedComments
);
userRouter.patch(
  "/comments/:commentId",
  authentication(),
  validation(UV.updateCommentSchema),
  US.updateComment
);
userRouter.delete("/comments/:commentId", authentication(), US.deleteComment);
userRouter.post(
  "/comments/:commentId/react",
  authentication(),
  validation(UV.commentReactionSchema),
  US.reactToComment
);
userRouter.get("/comments/search", authentication(), US.searchComments);
userRouter.get("/users/:userId/comments", authentication(), US.getUserComments);

// Post freeze/unfreeze routes
userRouter.patch(
  "/posts/:postId/freeze",
  authentication(),
  validation(UV.freezePostSchema),
  US.freezePost
);
userRouter.patch(
  "/posts/:postId/unfreeze",
  authentication(),
  validation(UV.unfreezePostSchema),
  US.unfreezePost
);
userRouter.delete(
  "/posts/:postId/hard-delete",
  authentication(),
  US.hardDeletePost
);

// Comment freeze/unfreeze routes
userRouter.patch(
  "/comments/:commentId/freeze",
  authentication(),
  validation(UV.freezeCommentSchema),
  US.freezeComment
);
userRouter.patch(
  "/comments/:commentId/unfreeze",
  authentication(),
  validation(UV.unfreezeCommentSchema),
  US.unfreezeComment
);
userRouter.delete(
  "/comments/:commentId/hard-delete",
  authentication(),
  US.hardDeleteComment
);

// Block/Unblock user routes
userRouter.post(
  "/users/:userId/block",
  authentication(),
  validation(UV.blockUserSchema),
  US.blockUser
);
userRouter.delete("/users/:userId/unblock", authentication(), US.unblockUser);
userRouter.get("/blocked-users", authentication(), US.getBlockedUsers);

// Friend request routes
userRouter.post(
  "/friend-requests/:userId",
  authentication(),
  validation(UV.sendFriendRequestSchema),
  US.sendFriendRequest
);
userRouter.patch(
  "/friend-requests/:requestId/respond",
  authentication(),
  validation(UV.respondFriendRequestSchema),
  US.respondFriendRequest
);
userRouter.get(
  "/friend-requests/pending",
  authentication(),
  US.getPendingFriendRequests
);
userRouter.get("/friends", authentication(), US.getFriends);
userRouter.delete("/friends/:userId", authentication(), US.unfriend);

export default userRouter;
