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
userRouter.get("/refreshToken", authentication(TokenType.refresh), US.refreshToken);
userRouter.post("/logout", authentication(),validation(UV.logoutSchema), US.logout);

export default userRouter;
