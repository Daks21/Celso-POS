-- ============================================================
-- Celso POS — PRE-DEPLOY DATA CLEANUP  (Phase 7 hardening)
-- ============================================================
-- PURPOSE
--   Neutralize the well-known DEMO accounts that ship in seed.sql, plus any
--   ad-hoc TEST owners created during development, so a database that was ever
--   touched by seed.sql (or used for testing) cannot be logged into with a
--   publicly-known password once it is exposed on the internet.
--
-- WHY UPDATE AND NOT DELETE
--   sales.cashier_id is FOREIGN KEY ... ON DELETE RESTRICT, so a user that has
--   rung up any sale CANNOT be deleted — the demo cashier (id=2) has seeded
--   sales and a DELETE would error out. We instead SUSPEND the account
--   (is_active = 0 → login returns 403) AND rotate the password hash to a
--   non-loginable random value (the known seed hash is destroyed). This is
--   idempotent and FK-safe; history/receipts stay intact.
--
-- THE REAL GUARDRAIL
--   Production should be built from schema.sql ONLY. NEVER run seed.sql against
--   a production database. This script is a belt-and-suspenders for any DB that
--   already has demo/test rows.
--
-- HOW TO RUN  (privileged user, e.g. root):
--   mysql -u root -p celsopos_db < database/cleanup_pre_deploy.sql
--   (PowerShell: Get-Content database\cleanup_pre_deploy.sql | mysql -u root -p celsopos_db)
-- ============================================================
USE celsopos_db;

-- ── 1. Known DEMO accounts from seed.sql (password was the public 'admin123') ──
--    Suspend + destroy the known hash. RANDOM(UUID) makes the stored value a
--    non-bcrypt string, so bcrypt.compare can never match it.
UPDATE users
   SET is_active = 0,
       password  = CONCAT('disabled-', REPLACE(UUID(), '-', ''))
 WHERE email IN ('admin@celsopos.com', 'cashier@celsopos.com');

-- ── 2. Ad-hoc TEST accounts created during development ─────────────────────────
--    These were registered by hand while testing (note the 'gamil.com' typo on
--    the first). Review this list before running — if any of these is an account
--    you intend to KEEP in production, remove it from the IN (...) set below.
--    Comment this block out entirely if your production DB is a fresh schema.sql
--    install (then none of these exist and there is nothing to clean).
UPDATE users
   SET is_active = 0,
       password  = CONCAT('disabled-', REPLACE(UUID(), '-', ''))
 WHERE email IN (
        'admin2@gamil.com',   -- typo'd domain; was a cashier in the demo store
        'admin3@gmail.com',   -- test owner (store 21)
        'admin4@gmail.com'    -- test owner (store 32)
       );

-- ── 3. Verify (no rows = clean) ────────────────────────────────────────────────
--    Lists any account still ACTIVE that uses a known/seeded bcrypt hash or a
--    demo email — should return zero rows after the updates above.
SELECT id, email, role, is_active
  FROM users
 WHERE is_active = 1
   AND email IN ('admin@celsopos.com', 'cashier@celsopos.com',
                 'admin2@gamil.com', 'admin3@gmail.com', 'admin4@gmail.com');
