import { NextFunction, Request, Response } from "express";
import userModel, { RoleType } from "./../../db/model/user.model.js";
import { userRepository } from "../../db/repositories/user.repository.js";
import { appError } from "../../utils/classError.js";
import { Compare, Hash } from "../../utils/hash.js";
import { generateOTP, sendEmail } from "../../service/sendEmail.js";
import { evenEmitter } from "../../service/event.js";
import {
  confirmEmailSchemaType,
  FlagType,
  logoutSchema,
  signInSchemaType,
  updatePasswordSchemaType,
  updateBasicInfoSchemaType,
  updateEmailSchemaType,
  confirmUpdateEmailSchemaType,
  likeUnlikeSchemaType,
  sendEmailTagsSchemaType,
  verify2FASchemaType,
  loginConfirmationSchemaType,
} from "./user.validation.js";
import { generateToken } from "../../utils/token.js";
import { RevokeTokenRepository } from "../../db/repositories/revokeToken.repository.js";
import RevokeTokenModel from "../../db/model/revokeToken.model.js";
import { LikeRepository } from "../../db/repositories/like.repository.js";
import LikeModel from "../../db/model/like.model.js";
import { v4 as uuidv4 } from "uuid";

class UserService {
  private _userModel = new userRepository(userModel);
  private _revokeToken = new RevokeTokenRepository(RevokeTokenModel);
  private _likeModel = new LikeRepository(LikeModel);
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

    if (user.twoFactorEnabled) {
      const otp = await generateOTP();
      const hashOtp = await Hash(String(otp));

      await this._userModel.updateOne({ _id: user._id }, { tempOtp: hashOtp });

      evenEmitter.emit("confirmEmail", {
        email: user.email,
        otp,
        purpose: "2-Factor Authentication",
      });

      return res.status(200).json({
        message: "2FA required. OTP sent to your email.",
        twoFactorRequired: true,
      });
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

  updatePassword = async (req: Request, res: Response, next: NextFunction) => {
    const { currentPassword, newPassword }: updatePasswordSchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (!(await Compare(currentPassword, user.password))) {
      throw new appError("current password is incorrect", 400);
    }

    const hashedNewPassword = await Hash(newPassword);
    await this._userModel.updateOne(
      { _id: req.user._id },
      { password: hashedNewPassword, changeCredentials: new Date() }
    );

    return res.status(200).json({ message: "password updated successfully" });
  };

  updateBasicInfo = async (req: Request, res: Response, next: NextFunction) => {
    const updateData: updateBasicInfoSchemaType = req.body;

    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(
        ([_, value]) => value !== undefined && value !== ""
      )
    );

    if (Object.keys(filteredData).length === 0) {
      throw new appError("no valid data to update", 400);
    }

    await this._userModel.updateOne({ _id: req.user._id }, filteredData);

    const updatedUser = await this._userModel.findOne({ _id: req.user._id });
    return res
      .status(200)
      .json({ message: "profile updated successfully", user: updatedUser });
  };

  updateEmail = async (req: Request, res: Response, next: NextFunction) => {
    const { newEmail }: updateEmailSchemaType = req.body;

    const existingUser = await this._userModel.findOne({ email: newEmail });
    if (existingUser) {
      throw new appError("email already exists", 409);
    }

    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    await this._userModel.updateOne(
      { _id: req.user._id },
      { tempOtp: hashOtp }
    );

    evenEmitter.emit("confirmEmail", {
      email: newEmail,
      otp,
      purpose: "Email Update Verification",
    });

    return res.status(200).json({ message: "OTP sent to new email" });
  };

  confirmUpdateEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { newEmail, otp }: confirmUpdateEmailSchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user || !user.tempOtp) {
      throw new appError("no pending email update found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        email: newEmail,
        $unset: { tempOtp: "" },
        changeCredentials: new Date(),
      }
    );

    return res.status(200).json({ message: "email updated successfully" });
  };

  likeUnlike = async (req: Request, res: Response, next: NextFunction) => {
    const { entityId, entityType }: likeUnlikeSchemaType = req.body;

    const result = await this._likeModel.toggleLike(
      req.user._id.toString(),
      entityId,
      entityType
    );

    const likesCount = await this._likeModel.countLikes(entityId, entityType);

    return res.status(200).json({
      message: `successfully ${result.action}`,
      liked: result.liked,
      likesCount,
    });
  };

  sendEmailTags = async (req: Request, res: Response, next: NextFunction) => {
    const { to, subject, message, tags }: sendEmailTagsSchemaType = req.body;

    let finalMessage = message;

    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        finalMessage = finalMessage.replace(
          new RegExp(`{{${key}}}`, "g"),
          value
        );
      });
    }

    await sendEmail({
      to,
      subject,
      html: finalMessage,
    });

    return res.status(200).json({ message: "email sent successfully" });
  };

  enable2FA = async (req: Request, res: Response, next: NextFunction) => {
    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (user.twoFactorEnabled) {
      throw new appError("2FA is already enabled", 400);
    }

    const otp = await generateOTP();
    const hashOtp = await Hash(String(otp));

    await this._userModel.updateOne(
      { _id: req.user._id },
      { tempOtp: hashOtp }
    );

    evenEmitter.emit("confirmEmail", {
      email: user.email,
      otp,
      purpose: "Enable 2-Factor Authentication",
    });

    return res
      .status(200)
      .json({ message: "OTP sent to your email for 2FA verification" });
  };

  verify2FA = async (req: Request, res: Response, next: NextFunction) => {
    const { otp }: verify2FASchemaType = req.body;

    const user = await this._userModel.findOne({ _id: req.user._id });
    if (!user || !user.tempOtp) {
      throw new appError("no pending 2FA verification found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: req.user._id },
      {
        twoFactorEnabled: true,
        $unset: { tempOtp: "" },
      }
    );

    return res.status(200).json({ message: "2FA enabled successfully" });
  };

  loginConfirmation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { email, otp }: loginConfirmationSchemaType = req.body;

    const user = await this._userModel.findOne({ email, confirmed: true });
    if (!user) {
      throw new appError("user not found", 404);
    }

    if (!user.twoFactorEnabled || !user.tempOtp) {
      throw new appError("no pending login verification found", 400);
    }

    if (!(await Compare(otp, user.tempOtp))) {
      throw new appError("invalid OTP", 400);
    }

    await this._userModel.updateOne(
      { _id: user._id },
      { $unset: { tempOtp: "" } }
    );

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
      .json({ message: `login successful`, access_token, refresh_token });
  };
}

export default new UserService();
