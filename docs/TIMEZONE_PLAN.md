================================================================
  Celso POS — Timezone Infrastructure Plan
  Goal: make the app timezone-aware (web + mobile ready) without
  corrupting any existing financial/sales records.
================================================================

AS-BUILT NOTE (supersedes the per-user assumptions below)
  Two decisions changed during implementation after auditing the SQL layer:
  1. SCOPE is store-wide, not per-user. The timezone lives in a single-row
     app_settings table (cached in memory, refreshed on write) — NOT a
     users column and NOT in the JWT. All staff of one store share "today".
  2. DAY-BUCKETING uses CONVERT_TZ inside the aggregation queries (named IANA
     zone when MySQL's tz tables are loaded, fixed-offset fallback otherwise),
     because sale.model.js buckets days in SQL via DATE(created_at). New
     pieces: backend/models/settings.model.js, backend/utils/tz.js,
     backend/controllers/settings.controller.js, routes/settings.routes.js,
     database/migrate_timezone.sql. Frontend reads the store tz from the
     login/me response and renders via formatDateTz/getStoreTz in core/data.js.
  Everything else below (UTC storage, never rewriting past records, the
  migration shift, the test/rollback plans) was implemented as written.

GUIDING PRINCIPLE (industry standard)
  - Store every timestamp in UTC (one universal anchor).
  - Display in the user's chosen timezone.
  - NEVER rewrite past timestamps when a user changes timezone.
    A sale happened at one absolute moment; that fact is immutable.
    Changing timezone only changes how dates are *shown* and how
    "today" / "this month" are *calculated* going forward.
  - Pure DATE fields the user picked by hand (occurred_at) are NOT
    timestamps and must NOT be shifted.

----------------------------------------------------------------
  CURRENT STATE (audited)
----------------------------------------------------------------
  - DB connection pinned to '+08:00'  (backend/config/db.config.js:12)
  - Schema uses DATETIME (timezone-naive), not TIMESTAMP
      DATETIME cols: users.created_at, products.created_at,
      products.updated_at, sales.created_at,
      inventory_adjustments.created_at, cash_movements.created_at
      DATE col (leave alone): cash_movements.occurred_at
  - users table ALREADY has a `preferences JSON` column
  - req.user is built ONLY from the JWT payload (id, fullName,
    email, role) — no DB lookup in auth.middleware.js
  - Hard-coded Asia/Manila day-boundary math in:
      analytics.controller.js (lines 5-7, 23-24, 30, 72, 102, 127,
        138, 140, 151, 182, 188)
      finance.controller.js   (lines 12, 24-25, 211)
      product.model.js:117-119 (restock occurred_at default)
      ai/context-builder.js:17-18 (today / 30-day window)
      backend/controllers/ai.controller.js:167 (tomorrow forecast)
  - AI cache key uses UTC date, not Manila (ai/assistant.js:9-11)
    — latent bug today: "today" rolls over at 8am Manila.
  - Frontend display uses toLocaleDateString('en-PH') / Manila in
    receipt.js, history.js, order.js, analytics.js, dashboard.js,
    finance.js, account.js (uses DEVICE timezone, not a chosen one)

----------------------------------------------------------------
  DECISIONS NEEDED  (recommendation in [brackets])
----------------------------------------------------------------
  D1. Where to store the user's timezone?
      [Dedicated `timezone` column on users + embed in JWT.]
      Rationale: analytics/finance/AI need it on EVERY request via
      req.user.timezone with zero extra DB queries. The preferences
      JSON is loaded lazily and is not in req.user, so it would cost
      a query per analytics call. Column is the single source of
      truth; preferences may mirror it for frontend convenience.

  D2. How to migrate existing DATETIME data to UTC?
      [Keep DATETIME, shift values in place: created_at -= 8 hours,
       then switch connection to UTC.]
      Transparent, auditable, no 2038 range limit. Alternative:
      convert columns to TIMESTAMP (auto-UTC) — cleaner in theory
      but introduces the 1970-2038 range cap. Stick with DATETIME.

  D3. JWT staleness when a user changes timezone?
      [Re-issue the JWT on timezone change; frontend swaps the token.]
      JWT lives 7 days; without re-issue, day-boundary math would use
      the old TZ until next login. Re-issue is clean and instant.

  D4. Display timezone source?
      [Honor the explicitly-chosen timezone even if the device TZ
       differs.] Consistency across web + mobile + multiple devices.
      Pass { timeZone } into every formatter instead of relying on
      the browser default.

  D5. Timezone validation?
      [Whitelist via Intl.supportedValuesOf('timeZone') (Node 18+).]
      Reject anything not a valid IANA zone.

  D6. occurred_at (DATE) handling?
      [Leave unshifted.] It is a user-picked calendar date, not a
      moment in time. Confirm agreement.

----------------------------------------------------------------
  STAGE 1 — DB FOUNDATION  (one-shot, hard to reverse — back up first)
----------------------------------------------------------------
  Step 1.1 — Full backup
    mysqldump -u root -p celsopos_db > backup_pre_tz_<date>.sql

  Step 1.2 — Add timezone column (idempotent)
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)
      NOT NULL DEFAULT 'Asia/Manila';

  Step 1.3 — Shift existing DATETIME values Manila->UTC (run ONCE)
    Guard against double-run with a marker; wrap in a transaction.
      START TRANSACTION;
      UPDATE users                 SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE products              SET created_at = created_at - INTERVAL 8 HOUR,
                                       updated_at = updated_at - INTERVAL 8 HOUR;
      UPDATE sales                 SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE inventory_adjustments SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE cash_movements        SET created_at = created_at - INTERVAL 8 HOUR;
      -- cash_movements.occurred_at (DATE) intentionally untouched.
      COMMIT;
    Idempotency: record the migration in a schema_migrations table (or
    a one-row flag) and refuse to re-run if already applied.

  Step 1.4 — Switch connection to UTC
    backend/config/db.config.js:12   timezone: 'Z'   // was '+08:00'
    From here, CURRENT_TIMESTAMP / NOW() write UTC.

  Step 1.5 — Re-point seed.sql
    Seed datetimes are Manila-implied; either pre-convert to UTC or
    document that seeds assume UTC after this change.

----------------------------------------------------------------
  STAGE 2 — BACKEND TIMEZONE-AWARENESS
----------------------------------------------------------------
  Step 2.1 — New util: backend/utils/tz.js
    export userTz(req)            -> req.user.timezone || 'Asia/Manila'
    export todayInTz(tz)          -> 'YYYY-MM-DD' for "now" in tz
    export dayBoundsUtc(tz, from, to) -> { startUtc, endUtc } so SQL
      range filters use correct UTC instants for a tz-local day window
    export isValidTz(tz)          -> Intl.supportedValuesOf check

  Step 2.2 — Thread timezone through identity
    user.model.js     : add `timezone` to findByEmail + findById SELECTs;
                        add updateTimezone(userId, tz)
    auth.controller.js: include timezone in jwt.sign payload; return it
                        in the login response and /me; re-issue token on
                        timezone change
    New route         : PUT /api/users/me/timezone (validates via
                        isValidTz, persists, returns a fresh token)

  Step 2.3 — Replace hard-coded Manila math with userTz(req)
    analytics.controller.js : all manilaFmt sites (see line list above)
    finance.controller.js   : lines 12, 24-25, 211
    product.model.js        : 117-119 restock occurred_at default
    ai/context-builder.js   : 17-18 today / 30-day window
    ai/controllers/ai.controller.js : 167 tomorrow forecast
    ai/assistant.js         : cache key 9-11 -> use tz-local date AND
                              include user id (or tz) so two users in
                              different zones never share a cache line

  Step 2.4 — Verify sale.model.js:132 note still holds under UTC session.

----------------------------------------------------------------
  STAGE 3 — FRONTEND + ONBOARDING + SETTINGS
----------------------------------------------------------------
  Step 3.1 — Shared display helper
    core/data.js (or utils.js): formatDateTz(value, tz, opts) that
    always passes { timeZone: tz } to Intl/toLocaleString.
    auth.js/api.js: store timezone from login; expose getUserTz().

  Step 3.2 — Onboarding modal timezone step
    onboarding.welcome.js + onboarding.css: add a timezone step that
    pre-selects Intl.DateTimeFormat().resolvedOptions().timeZone and
    lets the user confirm/change. Persist via PUT timezone endpoint.

  Step 3.3 — Account Settings timezone control
    account.html + account.js: timezone selector + a one-time notice:
      "Past records were saved at the moment they happened. Changing
       timezone only affects how dates are shown and how 'today' /
       'this month' are calculated going forward."
    On save: call PUT timezone, swap the returned token, re-render.

  Step 3.4 — Convert display sites to formatDateTz(..., getUserTz())
    receipt.js:38, history.js:97, order.js:495,
    analytics.js (535, 551, 591, 615-622), dashboard.js (66, 200,
    238, 254, 478, 565, 581), finance.js (74, 252, 657), account.js:48

----------------------------------------------------------------
  TEST PLAN
----------------------------------------------------------------
  - Pre/post migration row counts identical for all 6 tables.
  - Spot-check one known sale: created_at after == before - 8h.
  - occurred_at values unchanged.
  - Set a test user to Pacific/Honolulu (UTC-10): confirm "today's
    revenue", heatmap buckets, and finance monthly summary shift to
    that day window; Manila user is unaffected.
  - AI cache: same question from two different-TZ users produces
    distinct cache keys.
  - Receipt + history render correct local wall-clock time.
  - Regression: analytics period-over-period deltas, day-of-week
    chart, dashboard summary cards, finance Net/Profit/Debt cards.
  - Mobile (later): device in a non-Manila TZ still shows the user's
    chosen TZ, not the device TZ.

----------------------------------------------------------------
  ROLLBACK PLAN
----------------------------------------------------------------
  - DB: restore backup_pre_tz_<date>.sql. (Or, if connection was left
    at '+08:00', reverse the shift with + INTERVAL 8 HOUR — but only
    if Step 1.4 was not yet applied.)
  - Code: revert the feature branch.
  - The Step 1.3 shift MUST be idempotency-guarded so a re-run cannot
    double-shift.

----------------------------------------------------------------
  SCOPE NOTE
----------------------------------------------------------------
  Stages 1-3 are interdependent and should ship together. The
  onboarding dropdown alone (without Stage 1+2) would be a lie that
  creates silent day-boundary bugs. README "Phase 7: Deployment"
  should not start until this lands.
