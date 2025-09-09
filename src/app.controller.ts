import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve("./config/.env") });
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { appError } from "./utils/classError.js";
import userRouter from "./modules/users/user.controller.js";
import connectionDB from "./db/connectionDB.js";

const app: express.Application = express();
const port: string | number = process.env.PORT || 5000;
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  message: {
    error: "game over..........",
  },
  statusCode: 429,
  legacyHeaders: false,
});

const bootstrap = async () => {
  app.use(express.json());
  app.use(cors());
  app.use(helmet());
  app.use(limiter);

  app.get("/", (req, res, next) => {
    return res.status(200).json({ message: "welcome on my app" });
  });

  app.use("/users", userRouter);

  await connectionDB();
  app.use("{/*demo}", (req, res, next) => {
    throw new appError(`invalid url ${req.originalUrl}`, 404);
  });

  app.use((err: appError, req: Request, res: Response, next: NextFunction) => {
    return res
      .status((err.statusCode as unknown as number) || 500)
      .json({ message: err.message, stack: err.stack });
  });

  app.listen(port, () => {
    console.log(`server is running on port  ${port}....... `);
  });
};

export default bootstrap;
