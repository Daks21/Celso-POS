// backend/models/dailyBrief.model.js
//
// One row per Manila calendar day — caches the pre-computed dashboard
// summary so the first user of the day doesn't pay a cold-start LLM
// call. The scheduler in ../jobs/dailyBriefJob.js fires at 6am Manila
// to pre-warm; on a miss the /summary endpoint computes and writes
// here lazily.

const db = require('../config/db.config');

// Manila-local YYYY-MM-DD. Independent of server TZ.
function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })
    .format(new Date());
}

async function getForDate(dateStr) {
  const [rows] = await db.query(
    "SELECT brief_date, payload, tokens_used, latency_ms, " +
    "generated_by, generated_at FROM daily_brief WHERE brief_date = ?",
    [dateStr]
  );
  if (!rows[0]) return null;
  let parsed;
  try { parsed = JSON.parse(rows[0].payload); }
  catch (_) { return null; }
  return {
    date:        rows[0].brief_date,
    payload:     parsed,
    tokensUsed:  rows[0].tokens_used,
    latencyMs:   rows[0].latency_ms,
    generatedBy: rows[0].generated_by,
    generatedAt: rows[0].generated_at,
  };
}

// REPLACE INTO so the cron and the lazy path can both write without
// caring about prior rows for the same day.
async function save(entry) {
  await db.query(
    "REPLACE INTO daily_brief " +
    "(brief_date, payload, tokens_used, latency_ms, generated_by) " +
    "VALUES (?, ?, ?, ?, ?)",
    [
      entry.date,
      JSON.stringify(entry.payload),
      entry.tokensUsed ?? null,
      entry.latencyMs  ?? null,
      entry.generatedBy || 'lazy',
    ]
  );
}

module.exports = { manilaToday, getForDate, save };
