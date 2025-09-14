export const emailTemplate = (
  otp: string,
  purpose: string = "Email Verification"
) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .otp-container { background-color: #f8f9fa; border: 2px dashed #007bff; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .otp { font-size: 36px; font-weight: bold; color: #007bff; letter-spacing: 8px; }
            .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>SocialMedia App</h1>
                <h2>${purpose}</h2>
            </div>
            
            <p>Your verification code is:</p>
            
            <div class="otp-container">
                <div class="otp">${otp}</div>
            </div>
            
            <p>This code will expire in 10 minutes. Please do not share this code with anyone.</p>
            
            <div class="footer">
                <p>If you didn't request this code, please ignore this email.</p>
                <p>&copy; 2025 SocialMedia App. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};
