/**
 * Email sender via Nodemailer (SMTP configurable via .env).
 *
 * Required env vars:
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 465 (SSL) or 587 (TLS)
 *   SMTP_SECURE    true/false  (true = port 465, false = STARTTLS 587)
 *   SMTP_USER      your email address
 *   SMTP_PASS      app password (Gmail) or SMTP password
 *   MAIL_FROM      "RectoBoost <noreply@rectoversomedia.com>"
 */

import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== "false",      // true = SSL (port 465)
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

const FROM = process.env.MAIL_FROM || `RectoBoost <noreply@rectoversomedia.com>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

export async function sendPasswordResetEmail({ toEmail, toName, token }) {
  const resetUrl = `${APP_URL}/#/reset?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin:0; padding:0; background:#030914; font-family:Inter,sans-serif; color:#f7faff; }
    .wrap { max-width:520px; margin:40px auto; padding:0 20px; }
    .card { background:#07111f; border:1px solid rgba(124,167,231,0.16); border-radius:12px; padding:40px; }
    .logo { font-size:22px; font-weight:800; color:#0877ff; margin-bottom:32px; }
    h1 { margin:0 0 12px; font-size:24px; }
    p { margin:0 0 20px; color:#c8d2e6; line-height:1.6; }
    .btn { display:inline-block; padding:14px 32px; background:#0877ff; color:#fff; text-decoration:none;
           border-radius:8px; font-weight:700; font-size:15px; margin:8px 0 24px; }
    .url { word-break:break-all; background:#0a1627; border:1px solid rgba(124,167,231,0.16);
           border-radius:6px; padding:12px; color:#8c99b0; font-size:12px; }
    .foot { margin-top:32px; font-size:12px; color:#8c99b0; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="logo">⚡ RectoBoost</div>
      <h1>Reset Password Kamu</h1>
      <p>Halo ${toName || ""},</p>
      <p>Kami menerima permintaan untuk mereset password akun RectoBoost kamu. Klik tombol di bawah untuk melanjutkan:</p>
      <a class="btn" href="${resetUrl}">Reset Password</a>
      <p>Link ini berlaku selama <strong>1 jam</strong> dan hanya bisa digunakan sekali.</p>
      <p>Jika kamu tidak meminta reset password, abaikan email ini — akun kamu tetap aman.</p>
      <div class="url">${resetUrl}</div>
    </div>
    <div class="foot">
      &copy; 2026 RectoBoost &mdash; Rectoverso Media<br />
      Email ini dikirim otomatis, mohon tidak membalas.
    </div>
  </div>
</body>
</html>`;

  const transporter = createTransport();
  await transporter.sendMail({
    from:    FROM,
    to:      `${toName} <${toEmail}>`,
    subject: "Reset Password RectoBoost",
    html,
  });
}

export async function sendWelcomeEmail({ toEmail, toName }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin:0; padding:0; background:#030914; font-family:Inter,sans-serif; color:#f7faff; }
    .wrap { max-width:520px; margin:40px auto; padding:0 20px; }
    .card { background:#07111f; border:1px solid rgba(124,167,231,0.16); border-radius:12px; padding:40px; }
    .logo { font-size:22px; font-weight:800; color:#0877ff; margin-bottom:32px; }
    h1 { margin:0 0 12px; font-size:24px; }
    p { margin:0 0 20px; color:#c8d2e6; line-height:1.6; }
    .btn { display:inline-block; padding:14px 32px; background:#0877ff; color:#fff; text-decoration:none;
           border-radius:8px; font-weight:700; font-size:15px; margin:8px 0 24px; }
    .foot { margin-top:32px; font-size:12px; color:#8c99b0; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="logo">⚡ RectoBoost</div>
      <h1>Selamat datang, ${toName || ""}! 🎉</h1>
      <p>Akun RectoBoost kamu sudah aktif. Mulai kelola social media kamu dengan lebih mudah dari satu dashboard.</p>
      <a class="btn" href="${APP_URL}">Buka Dashboard</a>
      <p style="color:#8c99b0;font-size:13px">Ada pertanyaan? Buka tiket support dari dashboard kamu.</p>
    </div>
    <div class="foot">
      &copy; 2026 RectoBoost &mdash; Rectoverso Media
    </div>
  </div>
</body>
</html>`;

  const transporter = createTransport();
  await transporter.sendMail({
    from:    FROM,
    to:      `${toName} <${toEmail}>`,
    subject: "Selamat datang di RectoBoost! 🚀",
    html,
  });
}
