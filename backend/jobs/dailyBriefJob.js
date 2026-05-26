// backend/jobs/dailyBriefJob.js
//
// Self-rescheduling timer that fires at 06:00 Manila daily and
// pre-warms the daily_brief cache. No external cron dependency —
// just setTimeout. Server-restart safe: each restart recomputes the
// delay to the next 6am, so missing a fire only delays today's
// pre-warm (the lazy path in /summary still handles correctness).

const aiController = require('../controllers/ai.controller');

// 06:00 Manila = 22:00 UTC the previous day.
const TARGET_HOUR_UTC = 22;
const TARGET_MIN_UTC  = 0;

function msUntilNext6amManila() {
  const now    = new Date();
  const target = new Date(now);
  target.setUTCHours(TARGET_HOUR_UTC, TARGET_MIN_UTC, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}

async function run() {
  try {
    const t0     = Date.now();
    const result = await aiController.computeAndStoreDailyBrief('cron');
    console.log('[daily-brief] pre-warmed in ' + (Date.now() - t0) +
                'ms (tokens=' + (result.tokensUsed || '?') + ')');
  } catch (err) {
    console.error('[daily-brief] pre-warm failed:', err.message);
  }
}

function schedule() {
  const delay = msUntilNext6amManila();
  const hrs   = (delay / 3_600_000).toFixed(1);
  console.log('[daily-brief] next pre-warm in ' + hrs + 'h');
  setTimeout(async () => {
    await run();
    schedule();   // re-schedule for tomorrow
  }, delay).unref();   // don't block process exit
}

module.exports = { schedule, run, msUntilNext6amManila };
