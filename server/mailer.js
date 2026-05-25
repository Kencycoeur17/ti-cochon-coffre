// server/mailer.js
const nodemailer = require('nodemailer');

function mailerConfigured(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.FROM_EMAIL);
}

function createMailer(env) {
  if (!mailerConfigured(env)) {
    return {
      enabled: false,
      async send({ to, subject }) {
        console.warn(`[mailer] skipped: SMTP not configured. Intended recipient=${to || 'none'} subject=${subject || 'none'}`);
        return { skipped: true };
      }
    };
  }

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
    if (!to) {
      console.warn('[mailer] skipped: missing recipient');
      return { skipped: true };
    }

    return transporter.sendMail({
      from: env.FROM_EMAIL,
      to,
      subject,
      text: text || '',
      html: html || ''
    });
  }

  return { enabled: true, send };
}

module.exports = { createMailer, mailerConfigured };