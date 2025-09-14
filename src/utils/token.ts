import jwt, { JwtPayload } from "jsonwebtoken";
import { appError } from "./classError.js";
import { userRepository } from "../db/repositories/user.repository.js";
import userModel from "../db/model/user.model.js";
import { RevokeTokenRepository } from "../db/repositories/revokeToken.repository.js";
import RevokeTokenModel from "../db/model/revokeToken.model.js";


const _userModel = new userRepository(userModel)
const  _revokeToken = new RevokeTokenRepository(RevokeTokenModel);

export const generateToken = async ({
  payload,
  signature,
  options,
}: {
  payload: object;
  signature: string;
  options: jwt.SignOptions;
}): Promise<string> => {
  return jwt.sign(payload, signature, options);
};
export const verifyToken = async ({
  token,
  signature,
}: {
  token: string;
  signature: string;
}): Promise<JwtPayload> => {
  return jwt.verify(token, signature) as JwtPayload;
};

export enum TokenType{
    access = "access",
    refresh = "refresh"
}

export const getSignature = async(tokenType:TokenType,prefix:string)=>{
    if (tokenType === TokenType.access) {
        if (prefix === process.env.BEARER_USER) {
            return process.env.SIGNATURE_USER_TOKEN 
        } else if (prefix === process.env.BEARER_ADMIN) {
            return process.env.SIGNATURE_ADMIN_TOKEN
        }else{
            return null
        }
    }

    if (tokenType === TokenType.refresh) {
        if (prefix === process.env.BEARER_USER) {
            return process.env.SIGNATURE_USER_TOKEN 
        } else if (prefix === process.env.BEARER_ADMIN) {
            return process.env.SIGNATURE_ADMIN_TOKEN
        }else{
            return null
        }
    }
        return null
}

export const decodeTokenAndFetchUser = async(token:string,signature:string)=>{
    const decoded = await verifyToken({token,signature})
    if (!decoded) {
        throw new appError("invalid token",400); 
    }
    const user = await _userModel.findOne({email:decoded.email})
    if (!user) {
        throw new appError("user not found",404); 
    }
    if (!user?.confirmed) {
        throw new appError("user not confirmed",403);
    }

    if (await _revokeToken.findOne({tokenId:decoded?.jti})) {
      throw new appError("token revoked",403);
    }
    
    if (user.changeCredentials?.getTime() > (decoded.iat! * 1000)) {
      throw new appError("token expired",403);
    }

    return {user,decoded}
}