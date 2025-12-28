// server/mailer.js
const nodemailer = require('nodemailer');

function createMailer(env) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
    secure: env.SMTP_SECURE === 'true',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  async function send({ to, subject, html, text }) {
    return transporter.sendMail({
      from: env.FROM_EMAIL,
      to,
      subject,
      text: text || '',
      html: html || ''
    });
  }

  return { send };
}

module.exports = { createMailer };
