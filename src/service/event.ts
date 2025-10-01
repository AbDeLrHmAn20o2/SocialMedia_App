import { EventEmitter } from "events";
import { generateOTP, sendEmail } from "./sendEmail.js";
import { emailTemplate } from "./email.template.js";
import { deleteFileFromS3 } from "./awsS3.js";

export const evenEmitter = new EventEmitter();

evenEmitter.on("confirmEmail", async (data) => {
  const { email, otp, purpose = "Email Verification" } = data;
  await sendEmail({
    to: email,
    subject: `${purpose} - OTP Code`,
    html: emailTemplate(otp as unknown as string, purpose),
  });
});

evenEmitter.on("deleteProfileImage", async (data) => {
  const { imageKey, bucket } = data;
  try {
    if (imageKey && bucket) {
      console.log(`Deleting profile image: ${imageKey}`);
      await deleteFileFromS3(bucket, imageKey);
      console.log(`Profile image deleted successfully: ${imageKey}`);
    }
  } catch (error) {
    console.error(`Failed to delete profile image ${imageKey}:`, error);
  }
});

evenEmitter.on("accountStatusChanged", async (data) => {
  const { email, status, reason, userName } = data;
  const statusMessages = {
    frozen: "Your account has been temporarily frozen.",
    active: "Your account has been restored and is now active.",
    suspended: "Your account has been suspended.",
  };

  try {
    await sendEmail({
      to: email,
      subject: `Account Status Update - ${
        status.charAt(0).toUpperCase() + status.slice(1)
      }`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Account Status Update</h2>
          <p>Hello ${userName},</p>
          <p>${statusMessages[status as keyof typeof statusMessages]}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>If you have any questions, please contact support.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error(`Failed to send account status email to ${email}:`, error);
  }
});

// Post images deletion event
evenEmitter.on("deletePostImages", async (data) => {
  const { imageKeys, bucket, postId } = data;
  try {
    if (
      imageKeys &&
      Array.isArray(imageKeys) &&
      imageKeys.length > 0 &&
      bucket
    ) {
      console.log(
        `Deleting ${imageKeys.length} post images for post: ${postId}`
      );

      // Import deleteMultipleFiles dynamically to avoid circular dependency
      const { deleteMultipleFiles } = await import("./awsS3.js");

      const result = await deleteMultipleFiles(bucket, imageKeys);
      console.log(
        `Post images deleted successfully for post ${postId}:`,
        result
      );
    }
  } catch (error) {
    console.error(`Failed to delete post images for post ${postId}:`, error);
  }
});

// Comment deletion event
evenEmitter.on("commentDeleted", async (data) => {
  const { commentId, authorId, commentOn, commentOnModel } = data;
  try {
    console.log(`Comment deleted: ${commentId} by user: ${authorId}`);

    // You can add additional cleanup logic here if needed
    // For example, sending notifications, updating analytics, etc.

    console.log(`Comment deletion cleanup completed for comment: ${commentId}`);
  } catch (error) {
    console.error(
      `Failed to handle comment deletion for comment ${commentId}:`,
      error
    );
  }
});

// User deletion event - cascade delete all user data
evenEmitter.on("userDeleted", async (data) => {
  const { userId, deletedBy } = data;
  try {
    console.log(`User deleted: ${userId}, performing cascade cleanup...`);

    // Import repositories dynamically to avoid circular dependency
    const { PostRepository } = await import(
      "../db/repositories/post.repository.js"
    );
    const { CommentRepository } = await import(
      "../db/repositories/comment.repository.js"
    );
    const postModel = (await import("../db/model/post.model.js")).default;

    const postRepo = new PostRepository(postModel);
    const commentRepo = new CommentRepository();

    // Hard delete all user's posts and their comments
    const userPosts = await postRepo.getPostsByAuthorAdmin(userId, {
      includeDeleted: true,
    });
    for (const post of userPosts.data) {
      // Delete all comments for each post
      await commentRepo.hardDeleteByPost(post._id.toString());
      // Delete the post
      await postRepo.hardDelete(post._id.toString());
    }

    // Hard delete all user's comments
    const deletedCommentsCount = await commentRepo.hardDeleteByUser(userId);

    console.log(
      `User cascade cleanup completed for user: ${userId}, deleted ${deletedCommentsCount} comments`
    );
  } catch (error) {
    console.error(
      `Failed to handle user deletion cascade for user ${userId}:`,
      error
    );
  }
});

// Post deletion event - cascade delete comments
evenEmitter.on("postDeleted", async (data) => {
  const { postId, deletedBy } = data;
  try {
    console.log(`Post deleted: ${postId}, deleting related comments...`);

    // Import repository dynamically to avoid circular dependency
    const { CommentRepository } = await import(
      "../db/repositories/comment.repository.js"
    );
    const commentRepo = new CommentRepository();

    // Hard delete all comments related to this post
    const deletedCommentsCount = await commentRepo.hardDeleteByPost(postId);

    console.log(
      `Post deletion cleanup completed for post: ${postId}, deleted ${deletedCommentsCount} comments`
    );
  } catch (error) {
    console.error(
      `Failed to handle post deletion cascade for post ${postId}:`,
      error
    );
  }
});
