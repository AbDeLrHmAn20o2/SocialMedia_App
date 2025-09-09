import z from "zod";
import { GenderType } from "../../db/model/user.model.js";

export const signUpSchema = {
  body: z
    .strictObject({
      userName: z.string().min(2).trim(),
      email: z.email(),
      password: z
        .string()
        .regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/),
      cPassword: z.string(),
      age:z.number().min(18).max(60),
      address:z.string(),
      phone:z.string(),
      gender:z.enum([GenderType.male,GenderType.female]),
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
