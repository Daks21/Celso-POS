const db = require('../config/db.config');

const DEFAULT_TZ = 'Asia/Manila';

// Store-wide settings are tiny and change rarely, so we cache the timezone
// in memory and refresh it on write. This keeps every analytics/finance/AI
// request free of an extra DB round-trip just to learn the store timezone.
let _tz = DEFAULT_TZ;

// Load the store timezone from the DB into the in-memory cache. Called once
// on server start. Falls back to the default if the table/row is missing.
const load = async () => {
  try {
    const [rows] = await db.query('SELECT timezone FROM app_settings WHERE id = 1');
    if (rows[0] && rows[0].timezone) _tz = rows[0].timezone;
  } catch (_) {
    // app_settings may not exist yet (pre-migration) — keep the default.
  }
  return _tz;
};

// Synchronous read of the cached store timezone.
const getTimezone = () => _tz;

// Persist a new store timezone and refresh the cache.
const setTimezone = async (tz) => {
  await db.query(
    `INSERT INTO app_settings (id, timezone) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE timezone = VALUES(timezone)`,
    [tz]
  );
  _tz = tz;
  return _tz;
};

module.exports = { DEFAULT_TZ, load, getTimezone, setTimezone };
