import { NextFunction, Request, Response } from "express";
import { appError } from "../utils/classError.js";
import { decodeTokenAndFetchUser, getSignature, TokenType, } from "../utils/token.js";

declare global {
    namespace Express {
        interface Request {
            decoded?: any;
            user?: any;
        }
    }
}






export const authentication = (tokenType: TokenType=TokenType.access) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { authorization } = req.headers;
        const [prefix, token] = authorization?.split(" ") || [];
        if (!prefix || token) {
            throw new appError("invalid token", 400);
        }

        const signature = await getSignature(tokenType, prefix);
        if (!signature) {
            throw new appError("invalid signature", 400);
        }

        const decoded = await decodeTokenAndFetchUser(token!, signature);
        if (!decoded) {
            throw new appError("invalid token decoded", 400);
        }

        req.user = decoded?.user;
        req.decoded = decoded?.decoded;
        next();
    };

}