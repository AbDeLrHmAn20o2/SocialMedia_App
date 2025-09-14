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
  password: string;
  age: number;
  phone?: string;
  address?: string;
  gender: GenderType;
  confirmed: boolean;
  otp?: string;
  twoFactorEnabled?: boolean;
  tempOtp?: string;
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
    password: { type: String, required: true },
    age: { type: Number, min: 18, max: 60, required: true },
    phone: { type: String },
    otp: { type: String },
    tempOtp: { type: String },
    address: { type: String },
    confirmed: { type: Boolean },
    twoFactorEnabled: { type: Boolean, default: false },
    changeCredentials: { type: Date },
    gender: { type: String, enum: GenderType, required: true },
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
