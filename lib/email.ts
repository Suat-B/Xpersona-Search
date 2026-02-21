/**
 * Transactional email for password reset.
 * Uses Resend when RESEND_API_KEY is set; otherwise logs to console in development.
 */

function getFrom(): string {
  return process.env.EMAIL_FROM ?? "Xpersona <noreply@xpersona.co>";
}

function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = getFrom();
  const subject = "Reset your password – Xpersona";
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;">
  <div style="max-width:480px;margin:32px auto;padding:24px;">
    <h1 style="font-size:20px;margin:0 0 16px;">Reset your password</h1>
    <p style="margin:0 0 24px;line-height:1.5;color:#a3a3a3;">
      You requested a password reset. Click the button below to set a new password.
      This link expires in 1 hour.
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#ff375f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;">
      Reset password
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#737373;">
      If you didn't request this, you can ignore this email.
    </p>
  </div>
</body>
</html>
`.trim();

  const text = `Reset your password – Xpersona\n\nYou requested a password reset. Click the link below to set a new password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[email] Resend error:", error);
      throw new Error("Failed to send email");
    }
    return;
  }

  // Fallback: log in development
  if (process.env.NODE_ENV === "development") {
    console.log("[email] Password reset (no RESEND_API_KEY):");
    console.log("  To:", to);
    console.log("  Reset URL:", resetUrl);
    return;
  }

  throw new Error("RESEND_API_KEY is required to send password reset emails");
}
