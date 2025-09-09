import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { appError } from "../utils/classError.js";

type reqType = keyof Request;
type schemaType = Partial<Record<reqType, ZodType>>;

export const validation = (schema: schemaType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const validationErrors = [];
    for (const key of Object.keys(schema) as reqType[]) {
      const result = schema[key]?.safeParse(req[key]);
      if (!result?.success) {
        validationErrors.push(result?.error);
      }
    }
    if (validationErrors.length) {
      throw new appError(
        JSON.parse(validationErrors as unknown as string),
        400
      );
    }
    next();
  };
};
