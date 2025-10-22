import { Request, Response } from "express";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

/**
 * GraphQL Authentication Middleware
 * Extracts JWT token from Authorization header and validates it
 * Adds user information to the request context for GraphQL resolvers
 */
export const graphqlAuthMiddleware = (req: Request) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      isAuthenticated: false,
      user: null,
    };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY_TOKEN || "") as {
      _id: string;
      email: string;
      role: string;
      changeCredentials: string;
    };

    return {
      isAuthenticated: true,
      user: {
        _id: new Types.ObjectId(decoded._id),
        email: decoded.email,
        role: decoded.role,
        changeCredentials: decoded.changeCredentials,
      },
    };
  } catch (error) {
    // Token is invalid or expired
    return {
      isAuthenticated: false,
      user: null,
    };
  }
};

/**
 * Format GraphQL errors to include proper status codes
 */
export const formatGraphQLError = (error: any) => {
  if (error instanceof GraphQLError) {
    return {
      message: error.message,
      extensions: error.extensions,
    };
  }

  return {
    message: error.message || "An unexpected error occurred",
    extensions: {
      code: "INTERNAL_SERVER_ERROR",
      http: { status: 500 },
    },
  };
};
