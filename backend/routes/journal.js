const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { analyzeEmotion, analyzeEmotionStream } = require('../llmService');

// ── In-memory cache (hash → result) ──────────────────────────────────────────
const analysisCache = new Map();

function getCacheKey(text) {
  return crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
}

function getFromCache(text) {
  const key = getCacheKey(text);
  const entry = analysisCache.get(key);
  if (!entry) return null;
  // 7-day TTL
  if (Date.now() - entry.timestamp > 7 * 24 * 60 * 60 * 1000) {
    analysisCache.delete(key);
    return null;
  }
  return entry.result;
}

function saveToCache(text, result) {
  const key = getCacheKey(text);
  analysisCache.set(key, { result, timestamp: Date.now() });
}

// ── In-memory rate limiter (ip → { count, resetAt }) ─────────────────────────
const rateLimitStore = new Map();
const RATE_LIMIT = 10;        // max requests
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (record.count >= RATE_LIMIT) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT - record.count };
}

// ── Rate limit middleware (only for analyze routes) ───────────────────────────
function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const { allowed, remaining, retryAfter } = checkRateLimit(ip);

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter,
    });
  }
  next();
}

// ── POST /api/journal/analyze/stream — STREAMING with cache + rate limit ──────
router.post('/analyze/stream', rateLimitMiddleware, async (req, res) => {
  const { text, entryId } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Check cache first — if hit, stream it back word by word instantly
  const cached = getFromCache(text);
  if (cached) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Cache', 'HIT');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ type: 'emotion', emotion: cached.emotion });
    send({ type: 'keywords', keywords: cached.keywords });

    // Stream cached summary word by word (still looks like streaming)
    const words = cached.summary.split(' ');
    for (const word of words) {
      send({ type: 'token', token: word + ' ' });
      await new Promise(r => setTimeout(r, 40)); // faster since cached
    }
    send({ type: 'done', result: cached, fromCache: true });
    return res.end();
  }

  // Cache miss — call LLM with streaming, then cache result
  res.setHeader('X-Cache', 'MISS');
  await analyzeEmotionStream(text, res, (result) => {
    if (result) saveToCache(text, result);
  });
});

// ── POST /api/journal/analyze — regular with cache + rate limit ───────────────
router.post('/analyze', rateLimitMiddleware, async (req, res) => {
  const { text, entryId } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Check cache
  const cached = getFromCache(text);
  if (cached) {
    if (entryId) {
      await db.asyncRun(
        `UPDATE journal_entries SET emotion=?, keywords=?, summary=?, analyzed=1 WHERE id=?`,
        [cached.emotion, JSON.stringify(cached.keywords), cached.summary, entryId]
      );
    }
    return res.json({ ...cached, fromCache: true });
  }

  try {
    const analysis = await analyzeEmotion(text);
    saveToCache(text, analysis); // save to cache

    if (entryId) {
      await db.asyncRun(
        `UPDATE journal_entries SET emotion=?, keywords=?, summary=?, analyzed=1 WHERE id=?`,
        [analysis.emotion, JSON.stringify(analysis.keywords), analysis.summary, entryId]
      );
    }
    return res.json(analysis);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Analysis failed' });
  }
});

// ── GET /api/journal/insights/:userId ────────────────────────────────────────
router.get('/insights/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const entries = await db.asyncAll(`SELECT * FROM journal_entries WHERE userId = ?`, [userId]);
    if (!entries || entries.length === 0) {
      return res.json({ userId, totalEntries: 0, topEmotion: null, mostUsedAmbience: null, recentKeywords: [], emotionTrend: [] });
    }
    const emotionCount = {};
    const ambienceCount = {};
    entries.forEach(e => {
      if (e && e.emotion) emotionCount[e.emotion] = (emotionCount[e.emotion] || 0) + 1;
      if (e && e.ambience) ambienceCount[e.ambience] = (ambienceCount[e.ambience] || 0) + 1;
    });
    const topEmotion = Object.entries(emotionCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const mostUsedAmbience = Object.entries(ambienceCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const recentKeywords = [...new Set(
      entries.slice(-5).flatMap(e => {
        if (!e || !e.keywords) return [];
        try { return JSON.parse(e.keywords); } catch { return []; }
      })
    )].slice(0, 5);
    const emotionTrend = entries.filter(e => e && e.emotion).slice(-5)
      .map(e => ({ date: e.createdAt, emotion: e.emotion, ambience: e.ambience }));
    return res.json({ userId, totalEntries: entries.length, topEmotion, mostUsedAmbience, recentKeywords, emotionTrend });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// ── POST /api/journal — Create entry ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const { userId, ambience, text } = req.body;
  if (!userId || !text) return res.status(400).json({ error: 'userId and text are required' });
  const validAmbiences = ['forest', 'ocean', 'mountain', 'nature', 'rain', 'other'];
  const safeAmbience = validAmbiences.includes(ambience) ? ambience : 'nature';
  try {
    const result = await db.asyncRun(
      `INSERT INTO journal_entries (userId, ambience, text) VALUES (?, ?, ?)`,
      [userId, safeAmbience, text]
    );
    const entry = await db.asyncGet(`SELECT * FROM journal_entries WHERE id = ?`, [result.lastID]);
    return res.status(201).json({ message: 'Journal entry saved', entry });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to save entry' });
  }
});

// ── GET /api/journal/:userId — Get all entries ────────────────────────────────
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const entries = await db.asyncAll(
      `SELECT * FROM journal_entries WHERE userId = ? ORDER BY createdAt DESC`, [userId]
    );
    const parsed = (entries || []).map(e => {
      if (!e) return null;
      let keywords = [];
      try { keywords = e.keywords ? JSON.parse(e.keywords) : []; } catch {}
      return { ...e, keywords, analyzed: !!e.analyzed };
    }).filter(Boolean);
    return res.json({ userId, totalEntries: parsed.length, entries: parsed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

module.exports = router;
