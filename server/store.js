// server/store.js
const fse = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, 'server-data.json');

async function readAll() {
  return await fse.readJson(DB).catch(() => []);
}

async function append(event) {
  const list = await readAll();
  list.push(event);
  await fse.writeJson(DB, list, { spaces: 2 });
  return event;
}

async function list({ limit = 100 } = {}) {
  const list = await readAll();
  return list.slice(-limit).reverse();
}

module.exports = { append, list };
