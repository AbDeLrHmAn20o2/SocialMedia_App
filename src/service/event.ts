import { EventEmitter } from "events";
import { generateOTP, sendEmail } from "./sendEmail.js";
import { emailTemplate } from "./email.template.js";

export const evenEmitter = new EventEmitter();

evenEmitter.on("confirmEmail", async (data) => {
  const { email, otp, purpose = "Email Verification" } = data;
  await sendEmail({
    to: email,
    subject: `${purpose} - OTP Code`,
    html: emailTemplate(otp as unknown as string, purpose),
  });
});
