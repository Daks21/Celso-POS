const db       = require('../config/db.config');
const settings = require('../models/settings.model');

const DEFAULT_TZ = 'Asia/Manila';

// Whether MySQL has its named-timezone tables loaded (so CONVERT_TZ can take
// an IANA name like 'Asia/Manila'). Detected once on startup. When false we
// fall back to a fixed numeric offset, which CONVERT_TZ always understands.
let _namedZonesOk = false;

// Validate an IANA timezone string. Prefers the canonical supported list
// (Node 18+); falls back to attempting to construct a formatter.
const isValidTz = (tz) => {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone').includes(tz);
    }
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
};

// Current numeric UTC offset for a zone, e.g. '+08:00'. DST-aware for the
// given instant. Used as the CONVERT_TZ fallback when named zones aren't
// available in MySQL.
const offsetFor = (tz, when = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'longOffset',
    }).formatToParts(when);
    const name = parts.find(p => p.type === 'timeZoneName');
    const m = name && name.value.match(/([+-]\d{2}:\d{2})/);
    if (m) return m[1];
    if (name && /GMT|UTC/.test(name.value)) return '+00:00';
  } catch (_) { /* fall through */ }
  return '+00:00';
};

// 'YYYY-MM-DD' for an instant in a zone (defaults to now).
const dateInTz = (tz, when = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(when);

// Detect whether CONVERT_TZ accepts named zones in this MySQL install.
// Returns NULL when the timezone tables aren't loaded (e.g. PlanetScale).
const detectNamedZones = async () => {
  try {
    const [rows] = await db.query(
      "SELECT CONVERT_TZ('2020-06-01 00:00:00','+00:00','Asia/Manila') AS t"
    );
    _namedZonesOk = !!(rows[0] && rows[0].t != null);
  } catch (_) {
    _namedZonesOk = false;
  }
  return _namedZonesOk;
};

// The target-zone token to feed CONVERT_TZ: the IANA name when MySQL can
// resolve it (DST-accurate), otherwise the current fixed offset.
const tzParam = (tz = settings.getTimezone()) =>
  _namedZonesOk ? tz : offsetFor(tz);

// SQL fragment converting a UTC-stored column to store-local time. The caller
// pushes tzParam() into the params array once per occurrence. `col` is always
// a hard-coded column reference from our own code — never user input.
const localExpr = (col) => `CONVERT_TZ(${col}, '+00:00', ?)`;

module.exports = {
  DEFAULT_TZ, isValidTz, offsetFor, dateInTz,
  detectNamedZones, tzParam, localExpr,
};
