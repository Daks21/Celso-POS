// ai/assistant.js
const crypto   = require('crypto');
const groq     = require('./providers/groq');
const deepseek = require('./providers/deepseek');
const settings = require('../backend/models/settings.model');
const { dateInTz } = require('../backend/utils/tz');

const cache   = new Map();
const TTL_MS  = (parseInt(process.env.AI_CACHE_TTL_SEC) || 300) * 1000;

function cacheKey(question, storeId, tz) {
  // Scope the cache to the STORE so two tenants asking the same question on the
  // same day never share an answer (the cached text contains that store's own
  // business numbers). Roll over at the store's local midnight, and include the
  // timezone so a tz change can't serve stale day-based answers.
  const today = dateInTz(tz);
  return crypto.createHash('md5').update(question + '|' + storeId + '|' + today + '|' + tz).digest('hex');
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.value;
}

function setCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

async function callProvider(messages, options) {
  try {
    return await groq.getCompletion(messages, options);
  } catch (err) {
    const isQuota = err.status === 429 || err.status === 503;
    if (isQuota && process.env.DEEPSEEK_API_KEY) {
      return await deepseek.getCompletion(messages, options);
    }
    throw err;
  }
}

async function ask(systemPrompt, history, userMessage, options = {}) {
  const { storeId, storeTz = settings.getTimezone() } = options;

  if (options.stream) {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user',   content: userMessage },
    ];
    return callProvider(messages, { ...options, stream: true });
  }

  const key    = cacheKey(userMessage, storeId, storeTz);
  const cached = getCache(key);
  if (cached) return { ...cached, cached: true };

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user',   content: userMessage },
  ];

  const result = await callProvider(messages, options);
  setCache(key, result);
  return { ...result, cached: false };
}

module.exports = { ask };
