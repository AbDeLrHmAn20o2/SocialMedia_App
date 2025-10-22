// @ts-nocheck
import { GraphQLError } from "graphql";
import { Types } from "mongoose";
import userModel from "../db/model/user.model.js";
import postModel from "../db/model/post.model.js";
import postReactionModel from "../db/model/postReaction.model.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { PostRepository } from "../db/repositories/post.repository.js";
import { PostReactionRepository } from "../db/repositories/postReaction.repository.js";

/**
 * GraphQL Context Interface
 * Contains authenticated user information passed from middleware
 */
interface GraphQLContext {
  user?: {
    _id: Types.ObjectId;
    email: string;
    role: string;
  };
  isAuthenticated: boolean;
}

/**
 * User Repository instance for database operations
 */
const _userModel = new userRepository(userModel);

/**
 * Post Repository instance for database operations
 */
const _postModel = new PostRepository(postModel);

/**
 * Post Reaction Repository instance for database operations
 */
const _postReactionModel = new PostReactionRepository(postReactionModel);

/**
 * Helper function to check if user is authenticated
 * Throws GraphQLError if not authenticated
 */
const requireAuth = (context: GraphQLContext) => {
  if (!context.isAuthenticated || !context.user) {
    throw new GraphQLError("Authentication required", {
      extensions: {
        code: "UNAUTHENTICATED",
        http: { status: 401 },
      },
    });
  }
  return context.user;
};

/**
 * Helper function to check if user is admin
 * Throws GraphQLError if not admin
 */
const requireAdmin = (context: GraphQLContext) => {
  const user = requireAuth(context);
  if (user.role !== "admin") {
    throw new GraphQLError("Admin privileges required", {
      extensions: {
        code: "FORBIDDEN",
        http: { status: 403 },
      },
    });
  }
  return user;
};

/**
 * Helper function to validate MongoDB ObjectId
 */
const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

/**
 * Transform user document to remove sensitive fields
 */
const transformUser = (user: any) => {
  if (!user) return null;

  const userObj = user.toObject ? user.toObject() : user;

  // Remove sensitive fields
  delete userObj.password;
  delete userObj.otp;
  delete userObj.tempOtp;
  delete userObj.resetPasswordOtp;
  delete userObj.__v;

  return userObj;
};

/**
 * Transform post document
 */
const transformPost = (post: any) => {
  if (!post) return null;

  const postObj = post.toObject ? post.toObject() : post;
  delete postObj.__v;

  return postObj;
};

/**
 * Validate post input fields
 */
const validatePostInput = (input: any, isUpdate = false) => {
  if (!isUpdate) {
    // Required fields for creation
    if (!input.title || input.title.trim().length < 3) {
      throw new GraphQLError("Title must be at least 3 characters", {
        extensions: {
          code: "BAD_REQUEST",
          http: { status: 400 },
        },
      });
    }

    if (!input.content || input.content.trim().length < 10) {
      throw new GraphQLError("Content must be at least 10 characters", {
        extensions: {
          code: "BAD_REQUEST",
          http: { status: 400 },
        },
      });
    }
  } else {
    // Validation for update
    if (input.title && input.title.trim().length < 3) {
      throw new GraphQLError("Title must be at least 3 characters", {
        extensions: {
          code: "BAD_REQUEST",
          http: { status: 400 },
        },
      });
    }

    if (input.content && input.content.trim().length < 10) {
      throw new GraphQLError("Content must be at least 10 characters", {
        extensions: {
          code: "BAD_REQUEST",
          http: { status: 400 },
        },
      });
    }
  }

  if (input.title && input.title.length > 200) {
    throw new GraphQLError("Title cannot exceed 200 characters", {
      extensions: {
        code: "BAD_REQUEST",
        http: { status: 400 },
      },
    });
  }

  if (input.content && input.content.length > 5000) {
    throw new GraphQLError("Content cannot exceed 5000 characters", {
      extensions: {
        code: "BAD_REQUEST",
        http: { status: 400 },
      },
    });
  }
};

/**
 * GraphQL Resolvers
 * Contains all query resolvers for the GraphQL API
 */
export const resolvers = {
  /**
   * Query Resolvers
   * All root query fields and their resolver functions
   */
  Query: {
    /**
     * Get a single user by ID
     * @param _parent - Parent resolver (not used in root query)
     * @param args - Query arguments containing user ID
     * @param context - GraphQL context with authenticated user info
     * @returns User object or null if not found
     *
     * Access Control:
     * - Requires authentication
     * - Admins can fetch any user
     * - Regular users can only fetch their own profile
     */
    getOneUser: async (
      _parent: any,
      args: { id: string },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      // Validate ObjectId
      if (!isValidObjectId(args.id)) {
        throw new GraphQLError("Invalid user ID format", {
          extensions: {
            code: "BAD_REQUEST",
            http: { status: 400 },
          },
        });
      }

      // Check if user is authorized to view this profile
      const isAdmin = currentUser.role === "admin";
      const isSelf = currentUser._id.toString() === args.id;

      if (!isAdmin && !isSelf) {
        throw new GraphQLError(
          "You can only view your own profile unless you are an admin",
          {
            extensions: {
              code: "FORBIDDEN",
              http: { status: 403 },
            },
          }
        );
      }

      try {
        const user = await _userModel.findOne({ _id: args.id });

        if (!user) {
          throw new GraphQLError("User not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        return transformUser(user);
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch user", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Get all users with pagination and filtering
     * @param _parent - Parent resolver (not used in root query)
     * @param args - Query arguments with pagination, filter, and sort options
     * @param context - GraphQL context with authenticated user info
     * @returns UserConnection object with users array and pagination info
     *
     * Access Control:
     * - Requires admin authentication
     *
     * Features:
     * - Pagination support (page, limit)
     * - Multiple filter criteria (status, role, confirmed, etc.)
     * - Search by name or email
     * - Sorting by various fields
     */
    getAllUsers: async (
      _parent: any,
      args: {
        page?: number;
        limit?: number;
        filter?: {
          accountStatus?: string;
          role?: string;
          confirmed?: boolean;
          twoFactorEnabled?: boolean;
          authProvider?: string;
          gender?: string;
          searchText?: string;
          minAge?: number;
          maxAge?: number;
        };
        sort?: {
          field: string;
          order: string;
        };
      },
      context: GraphQLContext
    ) => {
      // Only admins can access all users
      requireAdmin(context);

      try {
        // Set defaults
        const page = args.page || 1;
        let limit = args.limit || 20;

        // Enforce max limit
        if (limit > 100) {
          limit = 100;
        }

        // Build query object based on filters
        const query: any = {};

        if (args.filter) {
          if (args.filter.accountStatus) {
            query.accountStatus = args.filter.accountStatus;
          }
          if (args.filter.role) {
            query.role = args.filter.role;
          }
          if (args.filter.confirmed !== undefined) {
            query.confirmed = args.filter.confirmed;
          }
          if (args.filter.twoFactorEnabled !== undefined) {
            query.twoFactorEnabled = args.filter.twoFactorEnabled;
          }
          if (args.filter.authProvider) {
            query.authProvider = args.filter.authProvider;
          }
          if (args.filter.gender) {
            query.gender = args.filter.gender;
          }
          if (args.filter.searchText) {
            const searchRegex = new RegExp(args.filter.searchText, "i");
            query.$or = [
              { fName: searchRegex },
              { lName: searchRegex },
              { email: searchRegex },
            ];
          }
          if (
            args.filter.minAge !== undefined ||
            args.filter.maxAge !== undefined
          ) {
            query.age = {};
            if (args.filter.minAge !== undefined) {
              query.age.$gte = args.filter.minAge;
            }
            if (args.filter.maxAge !== undefined) {
              query.age.$lte = args.filter.maxAge;
            }
          }
        }

        // Build sort object
        let sort: any = { createdAt: -1 }; // Default sort
        if (args.sort) {
          const sortField = args.sort.field || "createdAt";
          const sortOrder = args.sort.order === "asc" ? 1 : -1;
          sort = { [sortField]: sortOrder };
        }

        // Execute query with pagination
        const skip = (page - 1) * limit;
        const users = await userModel
          .find(query)
          .select("-password -otp -tempOtp -resetPasswordOtp")
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean();

        // Get total count for pagination
        const total = await userModel.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        return {
          users: users.map(transformUser),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error: any) {
        throw new GraphQLError("Failed to fetch users", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Get the currently authenticated user's profile
     * @param _parent - Parent resolver (not used in root query)
     * @param _args - No arguments required
     * @param context - GraphQL context with authenticated user info
     * @returns Current user object
     *
     * Access Control:
     * - Requires authentication
     */
    me: async (_parent: any, _args: any, context: GraphQLContext) => {
      const currentUser = requireAuth(context);

      try {
        const user = await _userModel.findOne({ _id: currentUser._id });

        if (!user) {
          throw new GraphQLError("User not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        return transformUser(user);
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch user profile", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Get statistics about users in the system
     * @param _parent - Parent resolver (not used in root query)
     * @param _args - No arguments required
     * @param context - GraphQL context with authenticated user info
     * @returns UserStats object with various counts
     *
     * Access Control:
     * - Requires admin authentication
     */
    getUserStats: async (_parent: any, _args: any, context: GraphQLContext) => {
      requireAdmin(context);

      try {
        const [
          totalUsers,
          confirmedUsers,
          twoFactorEnabledUsers,
          activeAccounts,
          frozenAccounts,
          suspendedAccounts,
          adminUsers,
          regularUsers,
        ] = await Promise.all([
          userModel.countDocuments({}),
          userModel.countDocuments({ confirmed: true }),
          userModel.countDocuments({ twoFactorEnabled: true }),
          userModel.countDocuments({ accountStatus: "active" }),
          userModel.countDocuments({ accountStatus: "frozen" }),
          userModel.countDocuments({ accountStatus: "suspended" }),
          userModel.countDocuments({ role: "admin" }),
          userModel.countDocuments({ role: "user" }),
        ]);

        return {
          totalUsers,
          confirmedUsers,
          twoFactorEnabledUsers,
          activeAccounts,
          frozenAccounts,
          suspendedAccounts,
          adminUsers,
          regularUsers,
        };
      } catch (error: any) {
        throw new GraphQLError("Failed to fetch user statistics", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Search users by name or email
     * @param _parent - Parent resolver (not used in root query)
     * @param args - Query arguments with search text and limit
     * @param context - GraphQL context with authenticated user info
     * @returns Array of matching users
     *
     * Access Control:
     * - Requires authentication
     *
     * Features:
     * - Case-insensitive search
     * - Searches in first name, last name, and email
     * - Only returns active, confirmed users
     */
    searchUsers: async (
      _parent: any,
      args: { searchText: string; limit?: number },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const limit = Math.min(args.limit || 20, 50); // Max 50 results
        const searchRegex = new RegExp(args.searchText, "i");

        const users = await userModel
          .find({
            $or: [
              { fName: searchRegex },
              { lName: searchRegex },
              { email: searchRegex },
            ],
            accountStatus: "active",
            confirmed: true,
          })
          .select("-password -otp -tempOtp -resetPasswordOtp")
          .limit(limit)
          .lean();

        return users.map(transformUser);
      } catch (error: any) {
        throw new GraphQLError("Failed to search users", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },
  },

  /**
   * Mutation Resolvers
   * All mutation fields and their resolver functions
   */
  Mutation: {
    /**
     * Create a new post
     * @param _parent - Parent resolver
     * @param args - Mutation arguments with post input
     * @param context - GraphQL context with authenticated user
     * @returns MutationResponse with created post
     */
    createPost: async (
      _parent: any,
      args: { input: any },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      try {
        // Validate input
        validatePostInput(args.input);

        // Create post data
        const postData: any = {
          title: args.input.title,
          content: args.input.content,
          author: currentUser._id,
          status: args.input.status || "draft",
          availability: args.input.availability || "public",
        };

        if (args.input.images) postData.images = args.input.images;
        if (args.input.imageKeys) postData.imageKeys = args.input.imageKeys;
        if (args.input.tags) {
          postData.tags = args.input.tags.map((tag: string) =>
            tag.toLowerCase().trim()
          );
        }

        const post = await _postModel.create(postData);
        const populatedPost = await _postModel.findById(post._id.toString());

        return {
          success: true,
          message: "Post created successfully",
          post: transformPost(populatedPost),
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to create post", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Update an existing post
     * @param _parent - Parent resolver
     * @param args - Mutation arguments with post ID and update input
     * @param context - GraphQL context with authenticated user
     * @returns MutationResponse with updated post
     */
    updatePost: async (
      _parent: any,
      args: { id: string; input: any },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      // Validate ObjectId
      if (!isValidObjectId(args.id)) {
        throw new GraphQLError("Invalid post ID format", {
          extensions: {
            code: "BAD_REQUEST",
            http: { status: 400 },
          },
        });
      }

      try {
        // Validate input
        validatePostInput(args.input, true);

        // Find post
        const post = await _postModel.findById(args.id);

        if (!post) {
          throw new GraphQLError("Post not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        // Authorization: Only author or admin can update
        const isAuthor = post.author.toString() === currentUser._id.toString();
        const isAdmin = currentUser.role === "admin";

        if (!isAuthor && !isAdmin) {
          throw new GraphQLError("You can only update your own posts", {
            extensions: {
              code: "FORBIDDEN",
              http: { status: 403 },
            },
          });
        }

        // Build update data
        const updateData: any = {};
        if (args.input.title !== undefined) updateData.title = args.input.title;
        if (args.input.content !== undefined)
          updateData.content = args.input.content;
        if (args.input.status !== undefined)
          updateData.status = args.input.status;
        if (args.input.availability !== undefined)
          updateData.availability = args.input.availability;

        if (args.input.images) {
          updateData.images = [...(post.images || []), ...args.input.images];
        }
        if (args.input.imageKeys) {
          updateData.imageKeys = [
            ...(post.imageKeys || []),
            ...args.input.imageKeys,
          ];
        }
        if (args.input.tags) {
          updateData.tags = args.input.tags.map((tag: string) =>
            tag.toLowerCase().trim()
          );
        }

        const updatedPost = await _postModel.updateById(args.id, updateData);

        return {
          success: true,
          message: "Post updated successfully",
          post: transformPost(updatedPost),
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to update post", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Delete a post (soft delete)
     * @param _parent - Parent resolver
     * @param args - Mutation arguments with post ID
     * @param context - GraphQL context with authenticated user
     * @returns MutationResponse
     */
    deletePost: async (
      _parent: any,
      args: { id: string },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      // Validate ObjectId
      if (!isValidObjectId(args.id)) {
        throw new GraphQLError("Invalid post ID format", {
          extensions: {
            code: "BAD_REQUEST",
            http: { status: 400 },
          },
        });
      }

      try {
        // Find post
        const post = await _postModel.findById(args.id);

        if (!post) {
          throw new GraphQLError("Post not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        // Authorization: Only author or admin can delete
        const isAuthor = post.author.toString() === currentUser._id.toString();
        const isAdmin = currentUser.role === "admin";

        if (!isAuthor && !isAdmin) {
          throw new GraphQLError("You can only delete your own posts", {
            extensions: {
              code: "FORBIDDEN",
              http: { status: 403 },
            },
          });
        }

        await _postModel.softDelete(args.id, currentUser._id.toString());

        return {
          success: true,
          message: "Post deleted successfully",
          post: null,
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to delete post", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Like or dislike a post
     * @param _parent - Parent resolver
     * @param args - Mutation arguments with post ID and reaction type
     * @param context - GraphQL context with authenticated user
     * @returns MutationResponse with updated post
     */
    likePost: async (
      _parent: any,
      args: { postId: string; reactionType: string },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      // Validate ObjectId
      if (!isValidObjectId(args.postId)) {
        throw new GraphQLError("Invalid post ID format", {
          extensions: {
            code: "BAD_REQUEST",
            http: { status: 400 },
          },
        });
      }

      try {
        // Find post
        const post = await _postModel.findById(args.postId);

        if (!post) {
          throw new GraphQLError("Post not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        // Check if post is accessible
        const isPublic =
          post.availability === "public" && post.status === "published";
        const isAuthor = post.author.toString() === currentUser._id.toString();
        const isAdmin = currentUser.role === "admin";

        if (!isPublic && !isAuthor && !isAdmin) {
          throw new GraphQLError(
            "You don't have permission to react to this post",
            {
              extensions: {
                code: "FORBIDDEN",
                http: { status: 403 },
              },
            }
          );
        }

        // Toggle reaction
        const result = await _postReactionModel.toggleReaction(
          currentUser._id.toString(),
          args.postId,
          args.reactionType as any
        );

        // Update post reaction counts
        const counts = await _postReactionModel.getReactionCounts(args.postId);

        await _postModel.updateById(args.postId, {
          likesCount: counts.likes,
          dislikesCount: counts.dislikes,
        });

        // Get updated post
        const updatedPost = await _postModel.findById(args.postId);

        return {
          success: true,
          message: `Post ${result.action}`,
          post: transformPost(updatedPost),
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to react to post", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Update user profile
     * @param _parent - Parent resolver
     * @param args - Mutation arguments with profile fields
     * @param context - GraphQL context with authenticated user
     * @returns MutationResponse
     */
    updateProfile: async (
      _parent: any,
      args: {
        fName?: string;
        lName?: string;
        age?: number;
        phone?: string;
        address?: string;
        gender?: string;
      },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      try {
        // Build update data
        const updateData: any = {};

        if (args.fName !== undefined) {
          if (args.fName.trim().length < 2) {
            throw new GraphQLError("First name must be at least 2 characters", {
              extensions: {
                code: "BAD_REQUEST",
                http: { status: 400 },
              },
            });
          }
          updateData.fName = args.fName.trim();
        }

        if (args.lName !== undefined) {
          if (args.lName.trim().length < 2) {
            throw new GraphQLError("Last name must be at least 2 characters", {
              extensions: {
                code: "BAD_REQUEST",
                http: { status: 400 },
              },
            });
          }
          updateData.lName = args.lName.trim();
        }

        if (args.age !== undefined) {
          if (args.age < 18 || args.age > 60) {
            throw new GraphQLError("Age must be between 18 and 60", {
              extensions: {
                code: "BAD_REQUEST",
                http: { status: 400 },
              },
            });
          }
          updateData.age = args.age;
        }

        if (args.phone !== undefined) updateData.phone = args.phone;
        if (args.address !== undefined) updateData.address = args.address;
        if (args.gender !== undefined) updateData.gender = args.gender;

        await _userModel.updateOne({ _id: currentUser._id }, updateData);

        return {
          success: true,
          message: "Profile updated successfully",
          post: null,
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to update profile", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },
  },

  /**
   * Parent Resolvers
   * Field-level resolvers that fetch related data
   */
  Post: {
    /**
     * Resolve author field for Post type
     * Replaces author ObjectId with full User object from database
     * @param parent - The parent Post object
     * @param _args - No arguments
     * @param context - GraphQL context
     * @returns User object
     */
    author: async (parent: any, _args: any, context: GraphQLContext) => {
      try {
        // If author is already populated (object), return it
        if (
          parent.author &&
          typeof parent.author === "object" &&
          parent.author._id
        ) {
          return transformUser(parent.author);
        }

        // Otherwise fetch from database
        const authorId = parent.author.toString();
        const user = await _userModel.findOne({ _id: authorId });

        if (!user) {
          throw new GraphQLError("Author not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        return transformUser(user);
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch author", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Resolve userReaction field for Post type
     * Gets current user's reaction to the post
     * @param parent - The parent Post object
     * @param _args - No arguments
     * @param context - GraphQL context with authenticated user
     * @returns Reaction type or null
     */
    userReaction: async (parent: any, _args: any, context: GraphQLContext) => {
      // If no user authenticated, return null
      if (!context.isAuthenticated || !context.user) {
        return null;
      }

      try {
        const reaction = await _postReactionModel.getUserReaction(
          context.user._id.toString(),
          parent._id.toString()
        );

        return reaction ? reaction.reactionType : null;
      } catch (error: any) {
        // If error fetching reaction, just return null
        return null;
      }
    },
  },

  /**
   * Additional Query Resolvers for Posts
   */
  Query: {
    ...resolvers.Query,

    /**
     * Get a single post by ID
     * @param _parent - Parent resolver
     * @param args - Query arguments with post ID
     * @param context - GraphQL context with authenticated user
     * @returns Post object with author resolved via parent resolver
     */
    getPost: async (
      _parent: any,
      args: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      // Validate ObjectId
      if (!isValidObjectId(args.id)) {
        throw new GraphQLError("Invalid post ID format", {
          extensions: {
            code: "BAD_REQUEST",
            http: { status: 400 },
          },
        });
      }

      try {
        const post = await _postModel.findById(args.id);

        if (!post) {
          throw new GraphQLError("Post not found", {
            extensions: {
              code: "NOT_FOUND",
              http: { status: 404 },
            },
          });
        }

        // Check access permissions
        const isPublic =
          post.availability === "public" && post.status === "published";
        const isAuthor = post.author.toString() === context.user._id.toString();
        const isAdmin = context.user.role === "admin";

        if (!isPublic && !isAuthor && !isAdmin) {
          throw new GraphQLError(
            "You don't have permission to view this post",
            {
              extensions: {
                code: "FORBIDDEN",
                http: { status: 403 },
              },
            }
          );
        }

        // Increment view count
        await _postModel.incrementField(args.id, "viewsCount");

        return transformPost(post);
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch post", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Get all posts with pagination and filtering
     * @param _parent - Parent resolver
     * @param args - Query arguments with pagination and filters
     * @param context - GraphQL context with authenticated user
     * @returns PostConnection with posts and pagination
     */
    getAllPosts: async (
      _parent: any,
      args: {
        page?: number;
        limit?: number;
        filter?: {
          authorId?: string;
          status?: string;
          availability?: string;
          tags?: string[];
          searchText?: string;
        };
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const page = args.page || 1;
        let limit = args.limit || 10;

        // Enforce max limit
        if (limit > 50) {
          limit = 50;
        }

        // Build query
        const query: any = {};

        if (args.filter) {
          if (args.filter.authorId) {
            if (!isValidObjectId(args.filter.authorId)) {
              throw new GraphQLError("Invalid author ID format", {
                extensions: {
                  code: "BAD_REQUEST",
                  http: { status: 400 },
                },
              });
            }
            query.author = args.filter.authorId;
          }

          if (args.filter.status) {
            query.status = args.filter.status;
          }

          if (args.filter.availability) {
            query.availability = args.filter.availability;
          }

          if (args.filter.tags && args.filter.tags.length > 0) {
            query.tags = {
              $in: args.filter.tags.map((tag: string) => tag.toLowerCase()),
            };
          }

          if (args.filter.searchText) {
            const searchRegex = new RegExp(args.filter.searchText, "i");
            query.$or = [{ title: searchRegex }, { content: searchRegex }];
          }
        }

        // If not admin and not filtering by specific author, show only public published posts
        const isAdmin = context.user.role === "admin";
        if (!isAdmin && !args.filter?.authorId) {
          query.status = "published";
          query.availability = "public";
        }

        // Execute query
        const skip = (page - 1) * limit;
        const posts = await postModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const total = await postModel.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        return {
          posts: posts.map(transformPost),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch posts", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },

    /**
     * Get posts by authenticated user
     * @param _parent - Parent resolver
     * @param args - Query arguments with pagination and status filter
     * @param context - GraphQL context with authenticated user
     * @returns PostConnection with user's posts
     */
    myPosts: async (
      _parent: any,
      args: {
        page?: number;
        limit?: number;
        status?: string;
      },
      context: GraphQLContext
    ) => {
      const currentUser = requireAuth(context);

      try {
        const page = args.page || 1;
        let limit = args.limit || 10;

        if (limit > 50) {
          limit = 50;
        }

        const query: any = { author: currentUser._id };

        if (args.status) {
          query.status = args.status;
        }

        const skip = (page - 1) * limit;
        const posts = await postModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const total = await postModel.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        return {
          posts: posts.map(transformPost),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        };
      } catch (error: any) {
        if (error instanceof GraphQLError) throw error;

        throw new GraphQLError("Failed to fetch your posts", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            http: { status: 500 },
            originalError: error.message,
          },
        });
      }
    },
  },
};
