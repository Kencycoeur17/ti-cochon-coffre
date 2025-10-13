// server/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fse = require('fs-extra');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DB = path.join(__dirname, 'server-data.json');
const API_KEY = process.env.API_KEY || 'change-me-super-secret';
const PORT = process.env.PORT || 3000;
const FROM_EMAIL = process.env.FROM_EMAIL || '"TiKochon" <no-reply@local>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fiaxy.net';

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: (process.env.SMTP_SECURE === 'true'), // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// helper to persist events
async function pushEvent(ev){
  const list = (await fse.readJson(DB).catch(()=>[]));
  list.push(ev);
  await fse.writeJson(DB, list, {spaces:2});
}

// simple email sender (returns promise)
async function sendEmail({to, subject, html, text}){
  const msg = {
    from: FROM_EMAIL,
    to,
    subject,
    text: text || '',
    html: html || ''
  };
  return transporter.sendMail(msg);
}

// middleware: check api key
function requireApiKey(req, res, next){
  const key = req.headers['x-api-key'] || req.query.api_key || '';
  if(!API_KEY || key !== API_KEY){
    return res.status(401).json({ok:false, message:'Invalid API key'});
  }
  next();
}

// POST /moncash  -> receive moncash event, persist, send emails
app.post('/moncash', requireApiKey, async (req, res) => {
  try{
    const { to, amount, ref, meta } = req.body || {};
    if(!to || !amount) return res.status(400).json({ok:false, message:"'to' and 'amount' required"});
    const ev = { id: Date.now(), to: to.toLowerCase(), amount: Number(amount), ref: ref||('MC-'+Date.now()), meta: meta||null, ts: new Date().toISOString() };
    await pushEvent({type:'moncash', event: ev});

    // send notification to admin
    const adminHtml = `
      <h3>MonCash reçu — TiKochon</h3>
      <p><strong>Destinataire:</strong> ${ev.to}</p>
      <p><strong>Montant:</strong> ${ev.amount}</p>
      <p><strong>Référence:</strong> ${ev.ref}</p>
      <p><small>${ev.ts}</small></p>
    `;
    await sendEmail({ to: ADMIN_EMAIL, subject: `MonCash reçu: ${ev.amount} → ${ev.to}`, html: adminHtml });

    // optional: send receipt to recipient (if you want)
    const userHtml = `
      <h3>Reçu: MonCash crédité</h3>
      <p>Bonjour,</p>
      <p>Votre compte a reçu ${ev.amount} USD (réf ${ev.ref}).</p>
      <p>Si vous n'êtes pas à l'origine de cette opération, contactez le support.</p>
    `;
    await sendEmail({ to: ev.to, subject: `Reçu: +${ev.amount} USD (MonCash)`, html: userHtml }).catch(()=>{/* ignore fail to user email */});

    return res.json({ ok:true, event: ev });
  }catch(err){
    console.error(err);
    return res.status(500).json({ok:false, message:'server error'});
  }
});

// POST /notify/signup -> notify admin of new signup, send welcome email
app.post('/notify/signup', requireApiKey, async (req, res) => {
  try{
    const { name, email } = req.body || {};
    if(!email || !name) return res.status(400).json({ok:false, message:"'name' and 'email' required"});
    const ev = { id: Date.now(), type:'signup', name, email, ts: new Date().toISOString() };
    await pushEvent(ev);

    const adminHtml = `<h3>Nouveau compte créé</h3>
      <p><strong>Nom:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><small>${ev.ts}</small></p>`;

    // notify admin
    await sendEmail({ to: ADMIN_EMAIL, subject:`Nouvelle inscription: ${email}`, html: adminHtml });

    // welcome email to user
    const userHtml = `<h3>Bienvenue sur Ti kochon coffre</h3>
      <p>Bonjour ${name}, merci pour votre inscription. Ceci est un email de confirmation (demo).</p>`;
    await sendEmail({ to: email, subject: 'Bienvenue — Ti kochon coffre', html: userHtml }).catch(()=>{/* ignore */});

    return res.json({ ok:true, event: ev });
  }catch(err){
    console.error(err);
    return res.status(500).json({ok:false, message:'server error'});
  }
});

// events list (for debugging)
app.get('/events', requireApiKey, async (req, res) => {
  const list = (await fse.readJson(DB).catch(()=>[]));
  res.json(list.reverse());
});

app.listen(PORT, ()=> console.log(`MonCash simulator + notifier listening on ${PORT}`));
