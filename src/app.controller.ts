import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve("./config/.env") });
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";
import { createHandler } from "graphql-http/lib/use/express";
import { appError } from "./utils/classError.js";
import userRouter from "./modules/users/user.controller.js";
import adminRouter from "./modules/admin/admin.controller.js";
import chatRouter from "./modules/chat/chat.controller.js";
import connectionDB from "./db/connectionDB.js";
import { initializeSocketServer } from "./socket/server.js";
import { schema } from "./graphql/index.js";
import {
  graphqlAuthMiddleware,
  formatGraphQLError,
} from "./graphql/middleware.js";

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

  app.get("/test-google", (req, res, next) => {
    return res.sendFile(resolve("./google-auth-test.html"));
  });

  app.use("/users", userRouter);
  app.use("/admin", adminRouter);
  app.use("/chat", chatRouter);

  // GraphQL endpoint with authentication context
  app.all(
    "/graphql",
    createHandler({
      schema,
      context: (req) => {
        const authContext = graphqlAuthMiddleware(req.raw);
        return authContext as any;
      },
    })
  );

  await connectionDB();
  app.use("{/*demo}", (req, res, next) => {
    throw new appError(`invalid url ${req.originalUrl}`, 404);
  });

  app.use((err: appError, req: Request, res: Response, next: NextFunction) => {
    return res
      .status((err.statusCode as unknown as number) || 500)
      .json({ message: err.message, stack: err.stack });
  });

  // Create HTTP server and initialize Socket.IO
  const httpServer = createServer(app);
  const io = initializeSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Socket.IO server is running`);
    console.log(`Admin namespace available at /admin`);
  });

  return { app, httpServer, io };
};

export default bootstrap;
