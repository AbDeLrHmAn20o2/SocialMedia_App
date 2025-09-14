import { EventEmitter } from "events";
import { generateOTP, sendEmail } from "./sendEmail.js";
import { emailTemplate } from "./email.template.js";

export const evenEmitter = new EventEmitter();

evenEmitter.on("confirmEmail", async (data) => {
  const { email , otp } = data;
  await sendEmail({
    to: email,
    subject: "Confirm Email",
    html: emailTemplate(otp as unknown as string),
  });
});
