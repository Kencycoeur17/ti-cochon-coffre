// Minimal MonCash simulator (dev only)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fse = require('fs-extra');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DB = path.join(__dirname, 'server-data.json');

async function pushEvent(ev){
  const list = (await fse.readJson(DB).catch(()=>[]));
  list.push(ev);
  await fse.writeJson(DB, list, {spaces:2});
}

app.post('/moncash', async (req, res) => {
  const { to, amount, ref } = req.body || {};
  if(!to || !amount) return res.status(400).json({ok:false, message:"'to' and 'amount' required"});
  const ev = { id: Date.now(), to: to.toLowerCase(), amount: Number(amount), ref: ref||('MC-'+Date.now()), ts: new Date().toISOString() };
  await pushEvent(ev);
  console.log('[MONCASH]', ev);
  return res.json({ ok:true, event: ev });
});

app.get('/events', async (req, res) => {
  const list = (await fse.readJson(DB).catch(()=>[]));
  res.json(list.reverse());
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log(`MonCash simulator listening on ${port}`));
