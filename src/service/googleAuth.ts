import { OAuth2Client } from "google-auth-library";
import { appError } from "../utils/classError.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  fName: string;
  lName: string;
  profilePicture: string | undefined;
  emailVerified: boolean;
}

export const verifyGoogleToken = async (
  token: string
): Promise<GoogleUserInfo> => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new appError("Google Client ID not configured", 500);
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new appError("Invalid Google token payload", 400);
    }

    const { sub, email, given_name, family_name, picture, email_verified } =
      payload;

    if (!email || !given_name || !family_name) {
      throw new appError("Incomplete Google profile information", 400);
    }

    return {
      googleId: sub!,
      email,
      fName: given_name,
      lName: family_name,
      profilePicture: picture,
      emailVerified: email_verified || false,
    };
  } catch (error) {
    if (error instanceof appError) {
      throw error;
    }
    throw new appError("Invalid Google token", 400);
  }
};
