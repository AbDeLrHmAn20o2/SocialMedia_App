import z from "zod";
import { GenderType } from "../../db/model/user.model.js";

export enum FlagType {
  all = "all",
  current = "current",
}

export const signInSchema = {
  body: z
    .strictObject({
      email: z.email(),
      password: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
    })
    .required(),
};
export const signUpSchema = {
  body: signInSchema.body
    .extend({
      userName: z.string().min(2).trim(),
      cPassword: z.string(),
      age: z.number().min(18).max(60),
      address: z.string(),
      phone: z.string(),
      gender: z.enum([GenderType.male, GenderType.female]),
    })
    .required()
    .refine(
      (data) => {
        return data.password === data.cPassword;
      },
      {
        error: "password dose not match",
        path: ["cPassword"],
      }
    ),
};

export const confirmEmailSchema = {
  body: z
    .strictObject({
      email: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};
export const logoutSchema = {
  body: z
    .strictObject({
      flag: z.enum(FlagType),
    })
    .required(),
};

export const updatePasswordSchema = {
  body: z
    .strictObject({
      currentPassword: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      newPassword: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      confirmPassword: z.string(),
    })
    .required()
    .refine(
      (data) => {
        return data.newPassword === data.confirmPassword;
      },
      {
        message: "new password does not match confirm password",
        path: ["confirmPassword"],
      }
    ),
};

export const updateBasicInfoSchema = {
  body: z
    .strictObject({
      fName: z.string().min(2).trim().optional(),
      lName: z.string().min(2).trim().optional(),
      age: z.number().min(18).max(60).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      gender: z.enum([GenderType.male, GenderType.female]).optional(),
    })
    .required(),
};

export const updateEmailSchema = {
  body: z
    .strictObject({
      newEmail: z.email(),
    })
    .required(),
};

export const confirmUpdateEmailSchema = {
  body: z
    .strictObject({
      newEmail: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export const likeUnlikeSchema = {
  body: z
    .strictObject({
      entityId: z.string(),
      entityType: z.string(),
    })
    .required(),
};

export const sendEmailTagsSchema = {
  body: z
    .strictObject({
      to: z.string().email(),
      subject: z.string().min(1),
      message: z.string().min(1),
      tags: z.record(z.string(), z.string()).optional(),
    })
    .required(),
};

export const enable2FASchema = {
  body: z.strictObject({}).required(),
};

export const verify2FASchema = {
  body: z
    .strictObject({
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export const loginConfirmationSchema = {
  body: z
    .strictObject({
      email: z.email(),
      otp: z.string().min(6).max(6).trim(),
    })
    .required(),
};

export type signInSchemaType = z.infer<typeof signInSchema.body>;
export type signUpSchemaType = z.infer<typeof signUpSchema.body>;
export type confirmEmailSchemaType = z.infer<typeof confirmEmailSchema.body>;
export type logoutSchema = z.infer<typeof logoutSchema.body>;
export type updatePasswordSchemaType = z.infer<
  typeof updatePasswordSchema.body
>;
export type updateBasicInfoSchemaType = z.infer<
  typeof updateBasicInfoSchema.body
>;
export type updateEmailSchemaType = z.infer<typeof updateEmailSchema.body>;
export type confirmUpdateEmailSchemaType = z.infer<
  typeof confirmUpdateEmailSchema.body
>;
export type likeUnlikeSchemaType = z.infer<typeof likeUnlikeSchema.body>;
export type sendEmailTagsSchemaType = z.infer<typeof sendEmailTagsSchema.body>;
export type enable2FASchemaType = z.infer<typeof enable2FASchema.body>;
export type verify2FASchemaType = z.infer<typeof verify2FASchema.body>;
export type loginConfirmationSchemaType = z.infer<
  typeof loginConfirmationSchema.body
>;
