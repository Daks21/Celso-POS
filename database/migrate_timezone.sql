-- Migration: Timezone Infrastructure (store UTC, display in store TZ)
-- Run ONCE against celsopos_db. Idempotent — guarded by schema_migrations.
--
-- DEPLOYMENT ORDER (important):
--   1. Stop the API server.
--   2. Back up the database (mysqldump).
--   3. Run this migration.
--   4. Deploy backend code (db.config.js now pins the session to UTC 'Z').
--   5. Start the API server.
--
-- WHY: existing DATETIME values were written as Manila wall-clock time.
-- The Philippines observes no DST, so its offset is a fixed +08:00 and
-- UTC = local - 8 hours for every existing row. This shifts all stored
-- timestamps to UTC so the app can convert to any store timezone going
-- forward. cash_movements.occurred_at is a user-picked calendar DATE
-- (no time component) and is intentionally left untouched.

USE celsopos_db;

-- 1. Store-wide settings (single row) ---------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id         TINYINT      NOT NULL PRIMARY KEY,   -- always 1
  timezone   VARCHAR(64)  NOT NULL DEFAULT 'Asia/Manila',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO app_settings (id, timezone) VALUES (1, 'Asia/Manila');

-- 2. Migration marker (idempotency guard) -----------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. One-time Manila -> UTC shift of existing DATETIME values ----------------
DROP PROCEDURE IF EXISTS _tz_shift_manila_to_utc;
DELIMITER //
CREATE PROCEDURE _tz_shift_manila_to_utc()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'tz_manila_to_utc') THEN
    START TRANSACTION;
      UPDATE users                 SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE products              SET created_at = created_at - INTERVAL 8 HOUR,
                                       updated_at = updated_at - INTERVAL 8 HOUR;
      UPDATE sales                 SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE inventory_adjustments SET created_at = created_at - INTERVAL 8 HOUR;
      UPDATE cash_movements        SET created_at = created_at - INTERVAL 8 HOUR;
      -- cash_movements.occurred_at (DATE) intentionally NOT shifted.
      INSERT INTO schema_migrations (name) VALUES ('tz_manila_to_utc');
    COMMIT;
  END IF;
END //
DELIMITER ;

CALL _tz_shift_manila_to_utc();
DROP PROCEDURE _tz_shift_manila_to_utc;
