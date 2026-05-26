// backend/models/aiQueryLog.model.js
//
// One INSERT per AI request — answers "what did Os see, what did it say,
// how long did it take, and which provider served it?". Failures here are
// swallowed: log loss must never propagate into a live user-facing error.

const crypto = require('crypto');
const db     = require('../config/db.config');

function hashQuestion(text) {
  if (!text) return null;
  return crypto.createHash('md5').update(String(text)).digest('hex');
}

async function log(entry) {
  try {
    await db.query(
      `INSERT INTO ai_query_log
         (user_id, endpoint, question_preview, question_hash,
          response_length, tokens_used, provider, latency_ms,
          cached, lang, error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        entry.userId   ?? null,
        entry.endpoint,
        entry.question ? String(entry.question).slice(0, 200) : null,
        entry.question ? hashQuestion(entry.question)         : null,
        entry.responseLength ?? null,
        entry.tokensUsed     ?? null,
        entry.provider       ?? null,
        entry.latencyMs      ?? null,
        entry.cached ? 1 : 0,
        entry.lang   ?? null,
        entry.error  ? String(entry.error).slice(0, 200) : null,
      ]
    );
  } catch (err) {
    // Never bubble logging errors back to the request.
    console.error('[ai-log] insert failed:', err.message);
  }
}

module.exports = { log };
