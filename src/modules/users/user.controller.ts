import { Router } from "express";
import US from "./user.service.js";
import { validation } from "../../middleware/validation.js";
import { signUpSchema } from "./user.validation.js";

const userRouter = Router();

userRouter.post("/signup", validation(signUpSchema), US.signUp);
userRouter.post("/signIn", US.signIn);

export default userRouter;
