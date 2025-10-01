import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import userModel, { RoleType } from "./../../db/model/user.model.js";
import { userRepository } from "../../db/repositories/user.repository.js";
import { appError } from "../../utils/classError.js";
import { Compare, Hash } from "../../utils/hash.js";
import { generateOTP, sendEmail } from "../../service/sendEmail.js";
import { evenEmitter } from "../../service/event.js";
import { verifyGoogleToken } from "../../service/googleAuth.js";
import {
  confirmEmailSchemaType,
  FlagType,
  logoutSchema,
  signInSchemaType,
  updatePasswordSchemaType,
  updateBasicInfoSchemaType,
  updateEmailSchemaType,
  confirmUpdateEmailSchemaType,
  likeUnlikeSchemaType,
  sendEmailTagsSchemaType,
  verify2FASchemaType,
  loginConfirmationSchemaType,
  googleAuthSchemaType,
  forgotPasswordSchemaType,
  resetPasswordSchemaType,
  createPostSchemaType,
  updatePostSchemaType,
  postReactionSchemaType,
  getPostsSchemaType,
  createCommentSchemaType,
  updateCommentSchemaType,
  getCommentsSchemaType,
  commentReactionSchemaType,
  searchCommentsSchemaType,
  freezePostSchemaType,
  unfreezePostSchemaType,
  freezeCommentSchemaType,
  unfreezeCommentSchemaType,
  blockUserSchemaType,
  unblockUserSchemaType,
  sendFriendRequestSchemaType,
  respondFriendRequestSchemaType,
  getEntityByIdSchemaType,
} from "./user.validation.js";
import { generateToken } from "../../utils/token.js";
import { RevokeTokenRepository } from "../../db/repositories/revokeToken.repository.js";
import RevokeTokenModel from "../../db/model/revokeToken.model.js";
import { LikeRepository } from "../../db/repositories/like.repository.js";
import LikeModel from "../../db/model/like.model.js";
import { PostRepository } from "../../db/repositories/post.repository.js";
import postModel, {
  PostStatus,
  PostAvailability,
} from "../../db/model/post.model.js";
import { PostReactionRepository } from "../../db/repositories/postReaction.repository.js";
import postReactionModel, {
  ReactionType,
} from "../../db/model/postReaction.model.js";
import { CommentRepository } from "../../db/repositories/comment.repository.js";
import commentModel, {
  CommentType,
  CommentStatus,
  IComment,
} from "../../db/model/comment.model.js";
import { FriendRequestRepository } from "../../db/repositories/friendRequest.repository.js";
import friendRequestModel, {
  FriendRequestStatus,
} from "../../db/model/friendRequest.model.js";
import { BlockedUserRepository } from "../../db/repositories/blockedUser.repository.js";
import blockedUserModel from "../../db/model/blockedUser.model.js";
import { v4 as uuidv4 } from "uuid";
import {
  uploadFileToS3,
  uploadLargeFileToS3,
  uploadMultipleFilesToS3,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  generateMultiplePresignedUploadUrls,
  getFileMetadata,
  downloadFileFromS3,
  listFiles,
  deleteFolderByPrefix,
  deleteFileFromS3,
  deleteMultipleFiles,
  getFileWithSignedUrl,
} from "../../service/awsS3.js";
import multer from "multer";

class UserService {
  private _userModel = new userRepository(userModel);
  private _revokeToken = new RevokeTokenRepository(RevokeTokenModel);
  private _likeModel = new LikeRepository(LikeModel);
  private _postModel = new PostRepository(postModel);
  private _postReactionModel = new PostReactionRepository(postReactionModel);
  private _commentModel = new CommentRepository();
  private _friendRequestModel = new FriendRequestRepository();
  private _blockedUserModel = new BlockedUserRepository();
  constructor() {
    this._userModel.create;
  }

  upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/tiff",
        "video/mp4",
        "video/avi",
        "video/mov",
        "video/wmv",
        "video/flv",
        "video/webm",
        "video/mkv",

        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",

        "application/zip",
        "application/x-rar-compressed",
        "application/x-7z-compressed",

        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
      ];

      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            "File type not supported! Allowed: images, videos, documents, archives, and audio files."
          )
        );
      }
    },
    limits: {
      fileSize: 500 * 1024 * 1024,
    },
  });

  async uploadFile(file: any) {
    if (!file) throw new Error("No file uploaded");

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) throw new Error("AWS_BUCKET_NAME not set");

    const fileSizeInMB = file.size / (1024 * 1024);
    const isLargeFile = fileSizeInMB >= 100;

    let result;
    if (isLargeFile) {
      console.log(
        `Uploading large file (${fileSizeInMB.toFixed(
          2
        )}MB) using multipart upload...`
      );
      result = await uploadLargeFileToS3(file, bucket);
    } else {
      console.log(
        `Uploading file (${fileSizeInMB.toFixed(2)}MB) using standard upload...`
      );
      result = await uploadFileToS3(file, bucket);
    }

    return {
      url: result.Location,
      key: result.Key,
      size: file.size,
      type: file.mimetype,
      uploadMethod: isLargeFile ? "multipart" : "standard",
    };
  }

  async uploadMultipleFiles(files: any[]) {
    if (!files || files.length === 0) throw new Error("No files uploaded");

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) throw new Error("AWS_BUCKET_NAME not set");

    console.log(`Starting upload of ${files.length} files...`);
    const result = await uploadMultipleFilesToS3(files, bucket);

    return {
      summary: {
        totalFiles: result.totalFiles,
        successful: result.successful,
        failed: result.failed,
      },
      results: result.results,
      successfulUploads: result.successfulUploads,
      failedUploads: result.failedUploads,
    };
  }

  uploadFiles = async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "No files uploaded. Use 'file' for single upload or 'files' for multiple uploads.",
      });
    }

    if (files.length === 1) {
      const result = await this.uploadFile(files[0]);
      res.json({
        success: true,
        uploadType: "single",
        ...result,
      });
    } else {
      const result = await this.uploadMultipleFiles(files);
      res.json({
        success: true,
        uploadType: "multiple",
        ...result,
      });
    }
  };

  getPresignedUploadUrl = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { fileName, contentType, expiresIn } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({
        success: false,
        error: "fileName and contentType are required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await generatePresignedUploadUrl(
      bucket,
      fileName,
      contentType,
      expiresIn || 3600
    );

    res.json({
      success: true,
      ...result,
    });
  };

  getPresignedDownloadUrl = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { key, expiresIn } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "key is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await generatePresignedDownloadUrl(
      bucket,
      key,
      expiresIn || 3600
    );

    res.json({
      success: true,
      ...result,
    });
  };

  getMultiplePresignedUploadUrls = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { files, expiresIn } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "files array is required with fileName and contentType for each file",
      });
    }

    for (const file of files) {
      if (!file.fileName || !file.contentType) {
        return res.status(400).json({
          success: false,
          error: "Each file must have fileName and contentType",
        });
      }
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await generateMultiplePresignedUploadUrls(
      bucket,
      files,
      expiresIn || 3600
    );

    res.json({
      success: true,
      ...result,
    });
  };

  getFileInfo = async (req: Request, res: Response, next: NextFunction) => {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await getFileMetadata(bucket, key);

    res.json({
      success: true,
      ...result,
    });
  };

  downloadFile = async (req: Request, res: Response, next: NextFunction) => {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await downloadFileFromS3(bucket, key);

    res.setHeader(
      "Content-Type",
      result.contentType || "application/octet-stream"
    );
    res.setHeader("Content-Length", result.contentLength || 0);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${key.split("/").pop()}"`
    );

    if (result.body instanceof ReadableStream) {
      const reader = result.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(value);
        return pump();
      };
      await pump();
    } else {
      res.send(result.body);
    }
  };

  listFiles = async (req: Request, res: Response, next: NextFunction) => {
    const { prefix, maxKeys } = req.query;

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await listFiles(
      bucket,
      prefix as string,
      maxKeys ? parseInt(maxKeys as string) : 1000
    );

    res.json({
      success: true,
      ...result,
    });
  };

  deleteFolder = async (req: Request, res: Response, next: NextFunction) => {
    const { prefix } = req.body;

    if (!prefix) {
      return res.status(400).json({
        success: false,
        error: "Prefix is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await deleteFolderByPrefix(bucket, prefix);

    res.json({
      ...result,
    });
  };

  deleteFile = async (req: Request, res: Response, next: NextFunction) => {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await deleteFileFromS3(bucket, key);

    res.json({
      ...result,
    });
  };

  deleteMultipleFiles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { keys } = req.body;

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Array of file keys is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await deleteMultipleFiles(bucket, keys);

    res.json({
      ...result,
    });
  };

  getFileWithSignedUrl = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { key } = req.params;
    const { expiresIn } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "File key is required",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const result = await getFileWithSignedUrl(
      bucket,
      key,
      expiresIn ? parseInt(expiresIn as string) : 3600
    );

    res.json({
      ...result,
    });
  };

  updateProfileImage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Profile image file is required",
      });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        error: "Only image files are allowed for profile picture",
      });
    }

    const bucket = process.env.AWS_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({
        success: false,
        error: "AWS_BUCKET_NAME not configured",
      });
    }

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const uploadResult = await this.uploadFile(file);

    if (user.profileImageKey) {
      evenEmitter.emit("deleteProfileImage", {
        imageKey: user.profileImageKey,
        bucket,
      });
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        profilePicture: uploadResult.url,
        profileImageKey: uploadResult.key,
      }
    );

    res.json({
      success: true,
      message: "Profile image updated successfully",
      profilePicture: uploadResult.url,
    });
  };

  freezeAccount = async (req: Request, res: Response, next: NextFunction) => {
    const { reason } = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (user.accountStatus === "frozen") {
      return res.status(400).json({
        success: false,
        error: "Account is already frozen",
      });
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        accountStatus: "frozen",
        frozenAt: new Date(),
        frozenReason: reason || "Self-requested freeze",
        changeCredentials: new Date(),
      }
    );

    evenEmitter.emit("accountStatusChanged", {
      email: user.email,
      status: "frozen",
      reason: reason || "Self-requested freeze",
      userName: user.userName || `${user.fName} ${user.lName}`,
    });

    res.json({
      success: true,
      message: "Account frozen successfully. You will be logged out.",
    });
  };

  restoreAccount = async (req: Request, res: Response, next: NextFunction) => {
    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (user.accountStatus !== "frozen") {
      return res.status(400).json({
        success: false,
        error: "Account is not frozen",
      });
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        accountStatus: "active",
        restoredAt: new Date(),
        $unset: { frozenAt: "", frozenReason: "" },
      }
    );

    evenEmitter.emit("accountStatusChanged", {
      email: user.email,
      status: "active",
      userName: user.userName || `${user.fName} ${user.lName}`,
    });

    res.json({
      success: true,
      message: "Account restored successfully",
    });
  };

  adminFreezeAccount = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId, reason } = req.body;

    const user = await this._userModel.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (user.accountStatus === "frozen") {
      return res.status(400).json({
        success: false,
        error: "Account is already frozen",
      });
    }

    await this._userModel.updateOne(
      { _id: userId },
      {
        accountStatus: "frozen",
        frozenAt: new Date(),
        frozenReason: reason || "Admin action",
        changeCredentials: new Date(), // Force logout
      }
    );

    evenEmitter.emit("accountStatusChanged", {
      email: user.email,
      status: "frozen",
      reason: reason || "Admin action",
      userName: user.userName || `${user.fName} ${user.lName}`,
    });

    res.json({
      success: true,
      message: "User account frozen successfully",
    });
  };

  adminRestoreAccount = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId } = req.body;

    const user = await this._userModel.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (user.accountStatus !== "frozen") {
      return res.status(400).json({
        success: false,
        error: "Account is not frozen",
      });
    }

    await this._userModel.updateOne(
      { _id: userId },
      {
        accountStatus: "active",
        restoredAt: new Date(),
        $unset: { frozenAt: "", frozenReason: "" },
      }
    );

    evenEmitter.emit("accountStatusChanged", {
      email: user.email,
      status: "active",
      userName: user.userName || `${user.fName} ${user.lName}`,
    });

    res.json({
      success: true,
      message: "User account restored successfully",
    });
  };

  createPost = async (req: Request, res: Response, next: NextFunction) => {
    const { title, content, tags, status, availability }: createPostSchemaType =
      req.body;
    const files = req.files as Express.Multer.File[];

    let imageUrls: string[] = [];
    let imageKeys: string[] = [];

    if (files && files.length > 0) {
      const uploadResult = await this.uploadMultipleFiles(files);

      if (uploadResult.summary.successful > 0) {
        uploadResult.successfulUploads.forEach((upload: any) => {
          imageUrls.push(upload.url);
          imageKeys.push(upload.key);
        });
      }
    }

    const post = await this._postModel.create({
      title,
      content,
      author: req.user._id,
      images: imageUrls,
      imageKeys: imageKeys,
      tags: tags || [],
      status: (status || "draft") as PostStatus,
      availability: (availability || "public") as PostAvailability,
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: await this._postModel.findById(post._id.toString()),
    });
  };

  getPosts = async (req: Request, res: Response, next: NextFunction) => {
    const {
      page = 1,
      limit = 10,
      status,
      availability,
      author,
      tags,
    } = req.query as any;

    const query: any = {};

    if (author && author === req.user._id.toString()) {
      query.author = author;
      if (status) query.status = status;
      if (availability) query.availability = availability;
    } else {
      query.status = "published";
      query.availability = "public";
      if (author) query.author = author;
    }

    if (tags) {
      const tagArray = tags
        .split(",")
        .map((tag: string) => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    const posts = await this._postModel.find(query, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    const totalPosts = await this._postModel.countDocuments(query);

    res.json({
      success: true,
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPosts,
        pages: Math.ceil(totalPosts / parseInt(limit)),
      },
    });
  };

  getPost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const canView =
      post.availability === "public" ||
      post.author._id.toString() === req.user._id.toString() ||
      req.user.role === "admin";

    if (!canView) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view this post",
      });
    }

    await this._postModel.incrementField(postId, "viewsCount");

    const userReaction = await this._postReactionModel.getUserReaction(
      req.user._id.toString(),
      postId
    );

    res.json({
      success: true,
      post: {
        ...post.toObject(),
        userReaction: userReaction?.reactionType || null,
      },
    });
  };

  updatePost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const { title, content, tags, status, availability }: updatePostSchemaType =
      req.body;
    const files = req.files as Express.Multer.File[];

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if user owns this post
    if (
      post.author._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own posts",
      });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (tags !== undefined) updateData.tags = tags;
    if (status !== undefined) updateData.status = status;
    if (availability !== undefined) updateData.availability = availability;

    // Handle new image uploads
    if (files && files.length > 0) {
      const uploadResult = await this.uploadMultipleFiles(files);

      if (uploadResult.summary.successful > 0) {
        const newImageUrls: string[] = [];
        const newImageKeys: string[] = [];

        uploadResult.successfulUploads.forEach((upload: any) => {
          newImageUrls.push(upload.url);
          newImageKeys.push(upload.key);
        });

        // Append to existing images
        updateData.images = [...(post.images || []), ...newImageUrls];
        updateData.imageKeys = [...(post.imageKeys || []), ...newImageKeys];
      }
    }

    const updatedPost = await this._postModel.updateById(postId, updateData);

    res.json({
      success: true,
      message: "Post updated successfully",
      post: updatedPost,
    });
  };

  deletePost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if user owns this post
    if (
      post.author._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own posts",
      });
    }

    await this._postModel.softDelete(postId, req.user._id.toString());

    res.json({
      success: true,
      message: "Post deleted successfully",
    });
  };

  reactToPost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const { reactionType }: postReactionSchemaType = req.body;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if post is accessible
    const canAccess =
      post.availability === "public" ||
      post.author._id.toString() === req.user._id.toString();

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to react to this post",
      });
    }

    const result = await this._postReactionModel.toggleReaction(
      req.user._id.toString(),
      postId,
      reactionType as ReactionType
    );

    // Update post reaction counts
    const counts = await this._postReactionModel.getReactionCounts(postId);

    await this._postModel.updateById(postId, {
      likesCount: counts.likes,
      dislikesCount: counts.dislikes,
    });

    res.json({
      success: true,
      message: `Post reaction ${result.action}`,
      reaction: {
        type: result.reactionType,
        action: result.action,
      },
      counts,
    });
  };

  getPostReactions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { postId } = req.params;
    const { type } = req.query;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const reactionType = type as ReactionType | undefined;
    const reactions = await this._postReactionModel.getPostReactions(
      postId,
      reactionType
    );
    const counts = await this._postReactionModel.getReactionCounts(postId);

    res.json({
      success: true,
      reactions,
      counts,
    });
  };

  createComment = async (req: Request, res: Response, next: NextFunction) => {
    const {
      content,
      commentOn,
      commentOnModel,
      parentComment,
    }: createCommentSchemaType = req.body;

    // Validate that the target exists
    if (commentOnModel === CommentType.post) {
      const post = await this._postModel.findById(commentOn);
      if (!post) {
        return res.status(404).json({
          success: false,
          error: "Post not found",
        });
      }
    } else if (commentOnModel === CommentType.comment) {
      const targetComment = await this._commentModel.findById(commentOn);
      if (!targetComment) {
        return res.status(404).json({
          success: false,
          error: "Comment not found",
        });
      }
    }

    // If this is a reply, validate parent comment exists
    if (parentComment) {
      const parent = await this._commentModel.findById(parentComment);
      if (!parent) {
        return res.status(404).json({
          success: false,
          error: "Parent comment not found",
        });
      }
    }

    const commentData: Partial<IComment> = {
      content,
      author: req.user._id,
      commentOn: new Types.ObjectId(commentOn),
      commentOnModel: commentOnModel as CommentType,
      status: CommentStatus.active,
    };

    if (parentComment) {
      commentData.parentComment = new Types.ObjectId(parentComment);
    }

    const comment = await this._commentModel.create(commentData);

    // Populate the created comment
    const populatedComment = await this._commentModel.findById(
      comment._id.toString(),
      {
        populateAuthor: true,
      }
    );

    res.status(201).json({
      success: true,
      message: "Comment created successfully",
      comment: populatedComment,
    });
  };

  // Get comments for a post or comment
  getComments = async (req: Request, res: Response, next: NextFunction) => {
    const { postId, commentId } = req.params;
    const queryOptions: getCommentsSchemaType = req.query as any;

    let commentOn: string;
    let commentOnModel: CommentType;

    if (postId) {
      commentOn = postId;
      commentOnModel = CommentType.post;

      // Verify post exists
      const post = await this._postModel.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          error: "Post not found",
        });
      }
    } else if (commentId) {
      commentOn = commentId;
      commentOnModel = CommentType.comment;

      // Verify comment exists
      const comment = await this._commentModel.findById(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          error: "Comment not found",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: "Either postId or commentId is required",
      });
    }

    const result = await this._commentModel.getComments(
      commentOn,
      commentOnModel,
      {
        ...queryOptions,
        populateAuthor: queryOptions.populateAuthor ?? true,
      }
    );

    res.json({
      success: true,
      comments: result.data,
      pagination: result.pagination,
    });
  };

  // Get root comments for a post
  getRootComments = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const queryOptions: getCommentsSchemaType = req.query as any;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    // Verify post exists
    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const result = await this._commentModel.getRootComments(
      postId,
      CommentType.post,
      {
        ...queryOptions,
        populateAuthor: queryOptions.populateAuthor ?? true,
        includeReplies: queryOptions.includeReplies ?? false,
      }
    );

    res.json({
      success: true,
      comments: result.data,
      pagination: result.pagination,
    });
  };

  // Get replies to a specific comment
  getReplies = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const queryOptions: getCommentsSchemaType = req.query as any;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    // Verify comment exists
    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    const result = await this._commentModel.getReplies(commentId, {
      ...queryOptions,
      populateAuthor: queryOptions.populateAuthor ?? true,
    });

    res.json({
      success: true,
      replies: result.data,
      pagination: result.pagination,
    });
  };

  // Get nested comments with hierarchy
  getNestedComments = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { commentId } = req.params;
    const {
      maxDepth = 5,
      sortBy = "createdAt",
      sortOrder = "asc",
    } = req.query as any;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    // Verify comment exists
    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    const nestedComments = await this._commentModel.getNestedComments(
      commentId,
      {
        maxDepth: parseInt(maxDepth),
        sortBy,
        sortOrder,
        populateAuthor: true,
      }
    );

    res.json({
      success: true,
      nestedComments,
    });
  };

  // Get single comment with details
  getComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId, {
      populateAuthor: true,
      populateCommentOn: true,
      includeReplies: true,
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    res.json({
      success: true,
      comment,
    });
  };

  // Update comment
  updateComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const { content }: updateCommentSchemaType = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Check if user owns this comment
    if (
      comment.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own comments",
      });
    }

    const updatedComment = await this._commentModel.updateById(commentId, {
      content,
    });

    res.json({
      success: true,
      message: "Comment updated successfully",
      comment: updatedComment,
    });
  };

  // Delete comment (soft delete)
  deleteComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Check if user owns this comment
    if (
      comment.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own comments",
      });
    }

    await this._commentModel.softDelete(commentId, req.user._id.toString());

    res.json({
      success: true,
      message: "Comment deleted successfully",
    });
  };

  // Like/Dislike comment (this would need a separate CommentReaction model similar to PostReaction)
  reactToComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const { reactionType }: commentReactionSchemaType = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // For now, we'll just increment/decrement the count directly
    // In a full implementation, you'd want a CommentReaction model
    const increment = reactionType === "like" ? 1 : -1;
    const field = reactionType === "like" ? "likesCount" : "dislikesCount";

    await this._commentModel.incrementField(commentId, field, increment);

    res.json({
      success: true,
      message: `Comment ${reactionType}d successfully`,
    });
  };

  // Search comments
  searchComments = async (req: Request, res: Response, next: NextFunction) => {
    const { q: searchText, ...options }: searchCommentsSchemaType =
      req.query as any;

    if (!searchText) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const result = await this._commentModel.searchComments(searchText, {
      ...options,
      populateAuthor: true,
    });

    res.json({
      success: true,
      comments: result.data,
      pagination: result.pagination,
      searchQuery: searchText,
    });
  };

  // Get user's comments
  getUserComments = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const queryOptions: getCommentsSchemaType = req.query as any;

    const targetUserId = userId || req.user._id.toString();

    const result = await this._commentModel.getUserComments(targetUserId, {
      ...queryOptions,
      populateAuthor: true,
      populateCommentOn: true,
    });

    res.json({
      success: true,
      comments: result.data,
      pagination: result.pagination,
    });
  };

  // =============== POST FREEZE/UNFREEZE METHODS ===============

  // Freeze post
  freezePost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const { reason, freezeDuration }: freezePostSchemaType = req.body;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if user owns this post or is admin
    if (
      post.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You can only freeze your own posts or you need admin privileges",
      });
    }

    const frozenPost = await this._postModel.freezePost(
      postId,
      req.user._id.toString(),
      reason,
      freezeDuration
    );

    res.json({
      success: true,
      message: "Post frozen successfully",
      post: frozenPost,
    });
  };

  // Unfreeze post
  unfreezePost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const { reason }: unfreezePostSchemaType = req.body;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if user owns this post or is admin
    if (
      post.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You can only unfreeze your own posts or you need admin privileges",
      });
    }

    const unfrozenPost = await this._postModel.unfreezePost(postId, reason);

    res.json({
      success: true,
      message: "Post unfrozen successfully",
      post: unfrozenPost,
    });
  };

  // Hard delete post
  hardDeletePost = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    const post = await this._postModel.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Only admin can hard delete
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only admins can permanently delete posts",
      });
    }

    // Emit event for cascading deletes
    evenEmitter.emit("postDeleted", {
      postId,
      deletedBy: req.user._id.toString(),
    });

    // Delete the post
    const deleted = await this._postModel.hardDelete(postId);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete post",
      });
    }

    res.json({
      success: true,
      message: "Post and related comments permanently deleted",
    });
  };

  // =============== COMMENT FREEZE/UNFREEZE METHODS ===============

  // Freeze comment
  freezeComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const { reason, freezeDuration }: freezeCommentSchemaType = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Check if user owns this comment or is admin
    if (
      comment.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You can only freeze your own comments or you need admin privileges",
      });
    }

    const frozenComment = await this._commentModel.freezeComment(
      commentId,
      req.user._id.toString(),
      reason,
      freezeDuration
    );

    res.json({
      success: true,
      message: "Comment frozen successfully",
      comment: frozenComment,
    });
  };

  // Unfreeze comment
  unfreezeComment = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const { reason }: unfreezeCommentSchemaType = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Check if user owns this comment or is admin
    if (
      comment.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You can only unfreeze your own comments or you need admin privileges",
      });
    }

    const unfrozenComment = await this._commentModel.unfreezeComment(
      commentId,
      reason
    );

    res.json({
      success: true,
      message: "Comment unfrozen successfully",
      comment: unfrozenComment,
    });
  };

  // Hard delete comment
  hardDeleteComment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Only admin can hard delete
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only admins can permanently delete comments",
      });
    }

    const deleted = await this._commentModel.hardDelete(commentId);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: "Failed to delete comment",
      });
    }

    res.json({
      success: true,
      message: "Comment permanently deleted",
    });
  };

  // =============== BLOCKING SYSTEM METHODS ===============

  // Block user
  blockUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const { reason }: blockUserSchemaType = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Can't block yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: "You cannot block yourself",
      });
    }

    // Check if user exists
    const userToBlock = await this._userModel.findOne({ _id: userId });
    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if already blocked
    const isAlreadyBlocked = await this._blockedUserModel.isBlocked(
      req.user._id.toString(),
      userId
    );

    if (isAlreadyBlocked) {
      return res.status(409).json({
        success: false,
        error: "User is already blocked",
      });
    }

    const blockData: any = {
      blocker: req.user._id,
      blocked: new Types.ObjectId(userId),
    };

    if (reason) {
      blockData.reason = reason;
    }

    const blockedUser = await this._blockedUserModel.create(blockData);

    res.json({
      success: true,
      message: "User blocked successfully",
      blockedUser,
    });
  };

  // Unblock user
  unblockUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const { reason }: unblockUserSchemaType = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const unblocked = await this._blockedUserModel.unblock(
      req.user._id.toString(),
      userId
    );

    if (!unblocked) {
      return res.status(404).json({
        success: false,
        error: "User is not blocked or already unblocked",
      });
    }

    res.json({
      success: true,
      message: "User unblocked successfully",
    });
  };

  // Get blocked users
  getBlockedUsers = async (req: Request, res: Response, next: NextFunction) => {
    const { page = 1, limit = 20 } = req.query as any;

    const result = await this._blockedUserModel.getBlockedUsers(
      req.user._id.toString(),
      {
        page: parseInt(page),
        limit: parseInt(limit),
        populateBlocked: true,
      }
    );

    res.json({
      success: true,
      blockedUsers: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  };

  // =============== FRIEND REQUEST METHODS ===============

  // Send friend request
  sendFriendRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { userId } = req.params;
    const { message }: sendFriendRequestSchemaType = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Can't send friend request to yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: "You cannot send friend request to yourself",
      });
    }

    // Check if user exists
    const targetUser = await this._userModel.findOne({ _id: userId });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if users have any block relationship
    const hasBlockRelationship =
      await this._blockedUserModel.hasBlockRelationship(
        req.user._id.toString(),
        userId
      );

    if (hasBlockRelationship) {
      return res.status(403).json({
        success: false,
        error: "Cannot send friend request due to blocking relationship",
      });
    }

    // Check if friend request already exists
    const existingRequest = await this._friendRequestModel.findBetweenUsers(
      req.user._id.toString(),
      userId
    );

    if (existingRequest) {
      if (existingRequest.status === FriendRequestStatus.pending) {
        return res.status(409).json({
          success: false,
          error: "Friend request already pending",
        });
      } else if (existingRequest.status === FriendRequestStatus.accepted) {
        return res.status(409).json({
          success: false,
          error: "Users are already friends",
        });
      }
    }

    const requestData: any = {
      sender: req.user._id,
      receiver: new Types.ObjectId(userId),
      status: FriendRequestStatus.pending,
    };

    if (message) {
      requestData.message = message;
    }

    const friendRequest = await this._friendRequestModel.create(requestData);

    res.status(201).json({
      success: true,
      message: "Friend request sent successfully",
      friendRequest,
    });
  };

  // Respond to friend request
  respondFriendRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { requestId } = req.params;
    const { action, message }: respondFriendRequestSchemaType = req.body;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: "Request ID is required",
      });
    }

    const friendRequest = await this._friendRequestModel.findById(requestId);
    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: "Friend request not found",
      });
    }

    // Check if user is the receiver
    if (friendRequest.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: "You can only respond to friend requests sent to you",
      });
    }

    // Check if request is still pending
    if (friendRequest.status !== FriendRequestStatus.pending) {
      return res.status(400).json({
        success: false,
        error: "Friend request has already been responded to",
      });
    }

    const newStatus =
      action === "accept"
        ? FriendRequestStatus.accepted
        : FriendRequestStatus.rejected;

    const updatedRequest = await this._friendRequestModel.updateStatus(
      requestId,
      newStatus,
      message
    );

    res.json({
      success: true,
      message: `Friend request ${action}ed successfully`,
      friendRequest: updatedRequest,
    });
  };

  // Get pending friend requests
  getPendingFriendRequests = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { page = 1, limit = 20 } = req.query as any;

    const result = await this._friendRequestModel.getPendingRequests(
      req.user._id.toString(),
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    res.json({
      success: true,
      friendRequests: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  };

  // Get friends list
  getFriends = async (req: Request, res: Response, next: NextFunction) => {
    const { page = 1, limit = 20 } = req.query as any;

    const result = await this._friendRequestModel.getFriends(
      req.user._id.toString(),
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    res.json({
      success: true,
      friends: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  };

  // Remove friend (unfriend)
  unfriend = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const removed = await this._friendRequestModel.removeFriendship(
      req.user._id.toString(),
      userId
    );

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Friendship not found or already removed",
      });
    }

    res.json({
      success: true,
      message: "Friend removed successfully",
    });
  };

  // =============== ENHANCED GET METHODS ===============

  // Get post by ID with enhanced options
  getPostById = async (req: Request, res: Response, next: NextFunction) => {
    const { postId } = req.params;
    const {
      includeDeleted,
      includeFrozen,
      populateAll,
    }: getEntityByIdSchemaType = req.query as any;

    if (!postId) {
      return res.status(400).json({
        success: false,
        error: "Post ID is required",
      });
    }

    let post;

    if (req.user.role === "admin" && (includeDeleted || includeFrozen)) {
      // Admin with special options
      post = await this._postModel.findByIdAdmin(postId, {
        includeDeleted,
        includeFrozen,
      });
    } else {
      // Regular user
      post = await this._postModel.findById(postId);
    }

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check access permissions
    const canAccess =
      post.availability === "public" ||
      post.author._id.toString() === req.user._id.toString() ||
      req.user.role === "admin";

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view this post",
      });
    }

    // Increment view count for non-frozen, non-deleted posts
    if (!post.isDeleted && !post.isFrozen) {
      await this._postModel.incrementField(postId, "viewsCount");
    }

    res.json({
      success: true,
      post,
    });
  };

  // Get comment by ID with enhanced options
  getCommentById = async (req: Request, res: Response, next: NextFunction) => {
    const { commentId } = req.params;
    const {
      includeDeleted,
      includeFrozen,
      populateAll,
    }: getEntityByIdSchemaType = req.query as any;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    let comment;

    if (req.user.role === "admin" && (includeDeleted || includeFrozen)) {
      // Admin with special options
      comment = await this._commentModel.findByIdAdmin(commentId, {
        includeDeleted,
        includeFrozen,
        populateAuthor: true,
      });
    } else {
      // Regular user
      comment = await this._commentModel.findById(commentId, {
        populateAuthor: true,
        populateCommentOn: populateAll,
      });
    }

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    res.json({
      success: true,
      comment,
    });
  };

  // Get comment with all replies
  getCommentWithReplies = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { commentId } = req.params;
    const { maxDepth = 5 } = req.query as any;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        error: "Comment ID is required",
      });
    }

    const comment = await this._commentModel.findById(commentId, {
      populateAuthor: true,
      includeReplies: true,
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Get nested replies
    const nestedReplies = await this._commentModel.getNestedComments(
      commentId,
      {
        maxDepth: parseInt(maxDepth),
        populateAuthor: true,
      }
    );

    res.json({
      success: true,
      comment: {
        ...comment.toObject(),
        nestedReplies,
      },
    });
  };

  // =============== USER MANAGEMENT METHODS ===============

  // Hard delete user (admin only)
  hardDeleteUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Only admin can hard delete users
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only admins can permanently delete users",
      });
    }

    // Can't delete yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: "You cannot delete yourself",
      });
    }

    const user = await this._userModel.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Emit event for cascading deletes
    evenEmitter.emit("userDeleted", {
      userId,
      deletedBy: req.user._id.toString(),
    });

    // Delete the user (this should be implemented in user repository)
    // const deleted = await this._userModel.hardDelete(userId);

    res.json({
      success: true,
      message: "User and all related data permanently deleted",
    });
  };

  // Send email to users with specific tags
  sendEmailToTaggedUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { tags, subject, message }: sendEmailTagsSchemaType = req.body;
    const urgent = req.body.urgent || false;

    // Only admin can send mass emails
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only admins can send mass emails",
      });
    }

    try {
      // For now, return a placeholder response since getUsersByTags method doesn't exist
      // In a real implementation, you would query users based on tags

      const mockUsers = []; // Replace with actual user query

      if (mockUsers.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No users found with the specified tags",
          tags: Array.isArray(tags) ? tags : Object.keys(tags),
        });
      }

      res.json({
        success: true,
        message: "Email functionality placeholder - needs implementation",
        recipientCount: 0,
        tags: Array.isArray(tags) ? tags : Object.keys(tags),
      });
    } catch (error) {
      console.error("Failed to send mass email:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send emails",
      });
    }
  };

  signUp = async (req: Request, res: Response, next: NextFunction) => {
    const {
      userName,
      email,
      password,
      cPassword,
      age,
      address,
      phone,
      gender,
    } = req.body;

    if (await this._userModel.findOne({ email })) {
      throw new appError("email already exist", 409);
    }

    const hash = await Hash(password);
    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    evenEmitter.emit("confirmEmail", { email, otp });

    const user = await this._userModel.createUser({
      userName,
      otp: hashOtp,
      email,
      password: hash,
      age,
      address,
      phone,
      gender,
    });

    return res.status(201).json({ message: `success`, user });
  };

  signIn = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password }: signInSchemaType = req.body;

    const user = await this._userModel.findOne({
      email,
      confirmed: true,
    });
    if (!user) {
      throw new appError("email not found or not confirmed", 404);
    }
    if (!(await Compare(password, user?.password!))) {
      throw new appError("email not found or not confirmed", 404);
    }

    if (user.twoFactorEnabled) {
      const otp = await generateOTP();
      const hashOtp = await Hash(String(otp));

      await this._userModel.updateOne({ _id: user._id }, { tempOtp: hashOtp });

      evenEmitter.emit("confirmEmail", {
        email: user.email,
        otp,
        purpose: "2-Factor Authentication",
      });

      return res.status(200).json({
        message: "2FA required. OTP sent to your email.",
        twoFactorRequired: true,
      });
    }

    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    return res
      .status(200)
      .json({ message: `success`, access_token, refresh_token });
  };

  confirmEmail = async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp }: confirmEmailSchemaType = req.body;
    const user = await this._userModel.findOne({
      email,
      confirmed: { $exists: false },
    });
    if (!user) {
      throw new appError("email not exist or already confirmed", 404);
    }
    if (!(await Compare(otp, user?.otp!))) {
      throw new appError("invalid otp", 400);
    }
    await this._userModel.updateOne(
      { email: user?.email },
      { confirmed: true, $unset: { otp: "" } }
    );

    return res.status(200).json({ message: `confirmed` });
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    return res.status(200).json({ message: `success`, user: req.user });
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    const { flag }: logoutSchema = req.body;
    if (flag === FlagType?.all) {
      await this._userModel.updateOne(
        { _id: req.user._id },
        { changeCredentials: new Date() }
      );
      return res.status(200).json({ message: `logout from all devices` });
    }

    await this._revokeToken.create({
      tokenId: req.decoded.jti!,
      userId: req.user?._id!,
      expireAt: new Date(req.decoded.exp! * 1000),
    });

    return res.status(200).json({ message: `logout from this device` });
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: req?.user?._id, email: req?.user?.email },
      signature:
        req?.user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: req?.user?._id, email: req?.user?.email },
      signature:
        req?.user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    await this._revokeToken.create({
      tokenId: req.decoded.jti!,
      userId: req.user?._id!,
      expireAt: new Date(req.decoded.exp! * 1000),
    });

    return res
      .status(200)
      .json({ message: `success`, access_token, refresh_token });
  };

  updatePassword = async (req: Request, res: Response, next: NextFunction) => {
    const { currentPassword, newPassword }: updatePasswordSchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (!user.password) {
      throw new appError(
        "password not set for this account. Use Google login or set password first",
        400
      );
    }

    if (!(await Compare(currentPassword, user.password))) {
      throw new appError("current password is incorrect", 400);
    }

    const hashedNewPassword = await Hash(newPassword);
    await this._userModel.updateOne(
      { _id: req.user._id },
      { password: hashedNewPassword, changeCredentials: new Date() }
    );

    return res.status(200).json({ message: "password updated successfully" });
  };

  updateBasicInfo = async (req: Request, res: Response, next: NextFunction) => {
    const updateData: updateBasicInfoSchemaType = req.body;

    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(
        ([_, value]) => value !== undefined && value !== ""
      )
    );

    if (Object.keys(filteredData).length === 0) {
      throw new appError("no valid data to update", 400);
    }

    await this._userModel.updateOne({ _id: req.user._id }, filteredData);

    const updatedUser = await this._userModel.findOne({ _id: req.user._id });
    return res
      .status(200)
      .json({ message: "profile updated successfully", user: updatedUser });
  };

  updateEmail = async (req: Request, res: Response, next: NextFunction) => {
    const { newEmail }: updateEmailSchemaType = req.body;

    const existingUser = await this._userModel.findOne({ email: newEmail });
    if (existingUser) {
      throw new appError("email already exists", 409);
    }

    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    await this._userModel.updateOne(
      { _id: req.user._id },
      { tempOtp: hashOtp }
    );

    evenEmitter.emit("confirmEmail", {
      email: newEmail,
      otp,
      purpose: "Email Update Verification",
    });

    return res.status(200).json({ message: "OTP sent to new email" });
  };

  confirmUpdateEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { newEmail, otp }: confirmUpdateEmailSchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user || !user.tempOtp) {
      throw new appError("no pending email update found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        email: newEmail,
        $unset: { tempOtp: "" },
        changeCredentials: new Date(),
      }
    );

    return res.status(200).json({ message: "email updated successfully" });
  };

  likeUnlike = async (req: Request, res: Response, next: NextFunction) => {
    const { entityId, entityType }: likeUnlikeSchemaType = req.body;

    const result = await this._likeModel.toggleLike(
      req.user._id.toString(),
      entityId,
      entityType
    );

    const likesCount = await this._likeModel.countLikes(entityId, entityType);

    return res.status(200).json({
      message: `successfully ${result.action}`,
      liked: result.liked,
      likesCount,
    });
  };

  sendEmailTags = async (req: Request, res: Response, next: NextFunction) => {
    const { to, subject, message, tags }: sendEmailTagsSchemaType = req.body;

    let finalMessage = message;

    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        finalMessage = finalMessage.replace(
          new RegExp(`{{${key}}}`, "g"),
          value
        );
      });
    }

    await sendEmail({
      to,
      subject,
      html: finalMessage,
    });

    return res.status(200).json({ message: "email sent successfully" });
  };

  enable2FA = async (req: Request, res: Response, next: NextFunction) => {
    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (user.twoFactorEnabled) {
      throw new appError("2FA is already enabled", 400);
    }

    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    await this._userModel.updateOne(
      { _id: req.user._id },
      { tempOtp: hashOtp }
    );

    evenEmitter.emit("confirmEmail", {
      email: user.email,
      otp,
      purpose: "Enable 2-Factor Authentication",
    });

    return res
      .status(200)
      .json({ message: "OTP sent to your email for 2FA verification" });
  };

  verify2FA = async (req: Request, res: Response, next: NextFunction) => {
    const { otp }: verify2FASchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user || !user.tempOtp) {
      throw new appError("no pending 2FA verification found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        twoFactorEnabled: true,
        $unset: { tempOtp: "" },
      }
    );

    return res.status(200).json({ message: "2FA enabled successfully" });
  };

  loginConfirmation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { email, otp }: loginConfirmationSchemaType = req.body;

    const user = await this._userModel.findOne({ email, confirmed: true });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (!user.twoFactorEnabled || !user.tempOtp) {
      throw new appError("no pending login verification found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: user._id },
      { $unset: { tempOtp: "" } }
    );

    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    return res
      .status(200)
      .json({ message: `login successful`, access_token, refresh_token });
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    const { email }: forgotPasswordSchemaType = req.body;

    const user = await this._userModel.findOne({
      email,
      confirmed: true,
    });

    if (!user) {
      throw new appError("email not found or not confirmed", 404);
    }

    if (user.authProvider === "google" && !user.password) {
      throw new appError(
        "this account uses Google login. Password reset not available",
        400
      );
    }

    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    await this._userModel.updateOne(
      { _id: user._id },
      { resetPasswordOtp: hashOtp }
    );

    evenEmitter.emit("confirmEmail", {
      email: user.email,
      otp,
      purpose: "Password Reset Verification",
    });

    return res.status(200).json({
      message: "OTP sent to your email for password reset",
    });
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp, newPassword }: resetPasswordSchemaType = req.body;

    const user = await this._userModel.findOne({
      email,
      confirmed: true,
    });

    if (!user) {
      throw new appError("email not found or not confirmed", 404);
    }

    if (!user.resetPasswordOtp) {
      throw new appError(
        "no password reset request found. Please request password reset first",
        400
      );
    }

    if (!(await Compare(otp, user.resetPasswordOtp))) {
      throw new appError("invalid OTP", 400);
    }

    const hashedNewPassword = await Hash(newPassword);

    await this._userModel.updateOne(
      { _id: user._id },
      {
        password: hashedNewPassword,
        $unset: { resetPasswordOtp: "" },
        changeCredentials: new Date(),
      }
    );

    return res.status(200).json({
      message: "password reset successfully",
    });
  };

  googleAuth = async (req: Request, res: Response, next: NextFunction) => {
    const { googleToken }: googleAuthSchemaType = req.body;

    const googleUser = await verifyGoogleToken(googleToken);

    let user = await this._userModel.findOne({
      $or: [{ email: googleUser.email }, { googleId: googleUser.googleId }],
    });

    if (user) {
      if (!user.googleId) {
        await this._userModel.updateOne(
          { _id: user._id },
          {
            googleId: googleUser.googleId,
            authProvider: "google",
            confirmed: true,
          }
        );
      }
    } else {
      const newUserData: any = {
        fName: googleUser.fName,
        lName: googleUser.lName,
        email: googleUser.email,
        googleId: googleUser.googleId,
        authProvider: "google",
        confirmed: true,
        age: 25,
      };

      if (googleUser.profilePicture) {
        newUserData.profilePicture = googleUser.profilePicture;
      }

      user = await this._userModel.createUser(newUserData);
    }

    if (user.twoFactorEnabled) {
      const otp = await generateOTP();
      const hashOtp = await Hash(String(otp));

      await this._userModel.updateOne({ _id: user._id }, { tempOtp: hashOtp });

      evenEmitter.emit("confirmEmail", {
        email: user.email,
        otp,
        purpose: "2-Factor Authentication",
      });

      return res.status(200).json({
        message: "2FA required. OTP sent to your email.",
        twoFactorRequired: true,
        email: user.email,
      });
    }

    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    return res.status(200).json({
      message: "Google authentication successful",
      access_token,
      refresh_token,
      user: {
        id: user._id,
        email: user.email,
        fName: user.fName,
        lName: user.lName,
        profilePicture: user.profilePicture,
      },
    });
  };
}

export default new UserService();
