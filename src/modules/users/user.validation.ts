import z from "zod";
import { GenderType } from "../../db/model/user.model.js";


export enum FlagType{
    all = "all",
    current = "current"
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
      flag: z.enum(FlagType)
    })
    .required(),
};

export type signInSchemaType = z.infer<typeof signInSchema.body>;
export type signUpSchemaType = z.infer<typeof signUpSchema.body>;
export type confirmEmailSchemaType = z.infer<typeof confirmEmailSchema.body>;
export type logoutSchema = z.infer<typeof logoutSchema.body>;
