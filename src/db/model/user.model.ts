import mongoose, { Types } from "mongoose";
export enum GenderType {
  male = "male",
  female = "female",
}
export enum RoleType {
  user = "user",
  admin = "admin",
}
export interface IUser {
  _id: Types.ObjectId;
  fName: string;
  lName: string;
  userName?: string;
  email: string;
  password?: string;
  age?: number;
  phone?: string;
  address?: string;
  gender?: GenderType;
  confirmed: boolean;
  otp?: string;
  twoFactorEnabled?: boolean;
  tempOtp?: string;
  resetPasswordOtp?: string;
  googleId?: string;
  profilePicture?: string;
  profileImageKey?: string; // S3 key for profile image
  authProvider?: string;
  accountStatus?: "active" | "frozen" | "suspended";
  frozenAt?: Date;
  frozenReason?: string;
  restoredAt?: Date;
  role?: RoleType;
  changeCredentials: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    fName: { type: String, required: true, minLength: 2, trim: true },
    lName: { type: String, required: true, minLength: 2, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String },
    age: { type: Number, min: 18, max: 60 },
    phone: { type: String },
    otp: { type: String },
    tempOtp: { type: String },
    resetPasswordOtp: { type: String },
    address: { type: String },
    confirmed: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    googleId: { type: String },
    profilePicture: { type: String },
    profileImageKey: { type: String }, // S3 key for deletion
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    accountStatus: {
      type: String,
      enum: ["active", "frozen", "suspended"],
      default: "active",
    },
    frozenAt: { type: Date },
    frozenReason: { type: String },
    restoredAt: { type: Date },
    changeCredentials: { type: Date },
    gender: { type: String, enum: GenderType },
    role: { type: String, enum: RoleType, default: RoleType.user },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

userSchema
  .virtual("userName")
  .set(function (value) {
    const [fName, lName] = value.split(" ");
    this.set({ fName, lName });
  })
  .get(function () {
    return this.fName + " " + this.lName;
  });

const userModel =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default userModel;
