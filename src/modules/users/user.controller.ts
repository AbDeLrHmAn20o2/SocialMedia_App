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

export default userRouter;
