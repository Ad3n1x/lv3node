const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendPasswordResetEmail = async (toEmail, resetUrl) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "Universal Tracker <onboarding@resend.dev>",
      to: [toEmail],
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your Universal Tracker account.</p>
          <p>Click the link below to set a new password. This link expires in 15 minutes:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Reset Password</a>
          <p style="margin-top: 20px; font-size: 0.85rem; color: #664;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Email sending exception:", err);
    return { success: false, error: err.message };
  }
};

module.exports = { sendPasswordResetEmail };