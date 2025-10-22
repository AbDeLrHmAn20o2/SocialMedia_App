import { Router } from "express";
import adminService, { updateRoleSchema } from "./admin.service.js";
import { authentication } from "../../middleware/Authentication.js";
import { TokenType } from "../../utils/token.js";
import { validation } from "../../middleware/validation.js";

const router = Router();

// Dashboard statistics
router.get(
  "/dashboard/stats",
  authentication(TokenType.access),
  adminService.getDashboardStats
);

// User management
router.get(
  "/users",
  authentication(TokenType.access),
  adminService.getAllUsers
);
router.get(
  "/users/:userId",
  authentication(TokenType.access),
  adminService.getUserDetails
);
router.patch(
  "/users/:userId/role",
  authentication(TokenType.access),
  validation(updateRoleSchema),
  adminService.updateUserRole
);
router.delete(
  "/users/:userId",
  authentication(TokenType.access),
  adminService.deleteUser
);

// Content moderation
router.get(
  "/moderation",
  authentication(TokenType.access),
  adminService.getContentModeration
);

export default router;
