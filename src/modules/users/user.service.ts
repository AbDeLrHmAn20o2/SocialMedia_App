import { NextFunction, Request, Response } from "express";
import userModel from "./../../db/model/user.model.js";
import { userRepository } from "../../db/repositories/user.repository.js";
import { appError } from "../../utils/classError.js";
import { Hash } from "../../utils/hash.js";
import { generateOTP, sendEmail } from "../../service/sendEmail.js";
import { emailTemplate } from "../../service/email.template.js";
import { evenEmitter } from "../../service/event.js";

class UserService {
  private _userModel = new userRepository(userModel);
  constructor() {
    this._userModel.create;
  }
  signUp = async (req: Request, res: Response, next: NextFunction) => {
    const {
      userName,
      email,
      password,
      cPassword,
      age,
      address,
      phone,
      gender,
    } = req.body;

    if (await this._userModel.findOne({ email })) {
      throw new appError("email already exist", 409);
    }

    const hash = await Hash(password);

    const user = await this._userModel.createUser({
      userName,
      email,
      password: hash,
      age,
      address,
      phone,
      gender,
    });

    evenEmitter.emit("confirmEmail", { email });

    return res.status(201).json({ message: `success`, user });
  };

  signIn = (req: Request, res: Response, next: NextFunction) => {
    return res.status(200).json({ message: `success` });
  };
}

export default new UserService();
