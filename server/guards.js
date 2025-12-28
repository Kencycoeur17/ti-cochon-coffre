// server/guards.js
function requireApiKey(apiKey) {
  return function (req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key || '';
    if (!apiKey || key !== apiKey) {
      return res.status(401).json({ ok: false, message: 'Invalid API key' });
    }
    next();
  };
}

// rate limit ultra-light (proto)
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map();

  return function (req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const slot = hits.get(ip) || { count: 0, ts: now };

    if (now - slot.ts > windowMs) {
      hits.set(ip, { count: 1, ts: now });
      return next();
    }

    slot.count += 1;
    hits.set(ip, slot);

    if (slot.count > max) {
      return res.status(429).json({ ok: false, message: 'Too many requests' });
    }

    next();
  };
}

module.exports = { requireApiKey, rateLimit };
