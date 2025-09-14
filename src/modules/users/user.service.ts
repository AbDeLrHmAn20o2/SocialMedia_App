import { NextFunction, Request, Response } from "express";
import userModel, { RoleType } from "./../../db/model/user.model.js";
import { userRepository } from "../../db/repositories/user.repository.js";
import { appError } from "../../utils/classError.js";
import { Compare, Hash } from "../../utils/hash.js";
import { generateOTP } from "../../service/sendEmail.js";
import { evenEmitter } from "../../service/event.js";
import {
  confirmEmailSchemaType,
  FlagType,
  logoutSchema,
  signInSchemaType,
} from "./user.validation.js";
import { generateToken } from "../../utils/token.js";
import { RevokeTokenRepository } from "../../db/repositories/revokeToken.repository.js";
import RevokeTokenModel from "../../db/model/revokeToken.model.js";
import { v4 as uuidv4 } from "uuid";

class UserService {
  private _userModel = new userRepository(userModel);
  private _revokeToken = new RevokeTokenRepository(RevokeTokenModel);
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
    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    evenEmitter.emit("confirmEmail", { email, otp });

    const user = await this._userModel.createUser({
      userName,
      otp: hashOtp,
      email,
      password: hash,
      age,
      address,
      phone,
      gender,
    });

    return res.status(201).json({ message: `success`, user });
  };

  signIn = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password }: signInSchemaType = req.body;

    const user = await this._userModel.findOne({
      email,
      confirmed: true,
    });
    if (!user) {
      throw new appError("email not found or not confirmed", 404);
    }
    if (!(await Compare(password, user?.password!))) {
      throw new appError("email not found or not confirmed", 404);
    }

    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: user._id, email: user.email },
      signature:
        user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    return res
      .status(200)
      .json({ message: `success`, access_token, refresh_token });
  };

  confirmEmail = async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp }: confirmEmailSchemaType = req.body;
    const user = await this._userModel.findOne({
      email,
      confirmed: { $exists: false },
    });
    if (!user) {
      throw new appError("email not exist or already confirmed", 404);
    }
    if (!(await Compare(otp, user?.otp!))) {
      throw new appError("invalid otp", 400);
    }
    await this._userModel.updateOne(
      { email: user?.email },
      { confirmed: true, $unset: { otp: "" } }
    );

    return res.status(200).json({ message: `confirmed` });
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    return res.status(200).json({ message: `success`, user: req.user });
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    const { flag }: logoutSchema = req.body;
    if (flag === FlagType?.all) {
      await this._userModel.updateOne(
        { _id: req.user._id },
        { changeCredentials: new Date() }
      );
      return res.status(200).json({ message: `logout from all devices` });
    }

    await this._revokeToken.create({
      tokenId: req.decoded.jti!,
      userId: req.user?._id!,
      expireAt: new Date(req.decoded.exp! * 1000),
    });

    return res.status(200).json({ message: `logout from this device` });
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    const jwtid = uuidv4();

    const access_token = await generateToken({
      payload: { id: req?.user?._id, email: req?.user?.email },
      signature:
        req?.user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: 60 * 60, jwtid: jwtid },
    });

    const refresh_token = await generateToken({
      payload: { id: req?.user?._id, email: req?.user?.email },
      signature:
        req?.user?.role == RoleType.user
          ? process.env.SIGNATURE_USER_TOKEN!
          : process.env.SIGNATURE_ADMIN_TOKEN!,
      options: { expiresIn: "1y", jwtid: jwtid },
    });

    await this._revokeToken.create({
      tokenId: req.decoded.jti!,
      userId: req.user?._id!,
      expireAt: new Date(req.decoded.exp! * 1000),
    });

    return res
      .status(200)
      .json({ message: `success`, access_token, refresh_token });
  };
}

export default new UserService();
