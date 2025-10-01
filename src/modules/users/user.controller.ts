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

export default userRouter;
