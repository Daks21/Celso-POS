-- Migration: users.last_login_at (operator analytics — activity tracking)
-- Run ONCE against celsopos_db as a privileged user (the app DB user has no DDL).
-- Idempotent — guarded by schema_migrations('last_login_v1') + an information_schema
-- column check, so a second run is a clean no-op. Fresh installs get the column
-- from schema.sql and skip this file.
--
-- DEPLOYMENT ORDER:
--   1. Stop the API server.
--   2. Run this migration.
--   3. Deploy the backend that stamps last_login_at on login.
--   4. Start the API server.
--
-- WHAT IT DOES:
--   - users: add last_login_at DATETIME (NULL until the user's next login after
--     this ships — backfill is intentionally skipped). The login flow stamps
--     NOW() on each successful login; the super-admin stats endpoint counts
--     active-in-7d / active-in-30d from it.

USE celsopos_db;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP PROCEDURE IF EXISTS _last_login_v1;
DELIMITER //
CREATE PROCEDURE _last_login_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'last_login_v1') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                       AND COLUMN_NAME = 'last_login_at') THEN
      ALTER TABLE users ADD COLUMN last_login_at DATETIME DEFAULT NULL AFTER session_id;
    END IF;
    INSERT INTO schema_migrations (name) VALUES ('last_login_v1');
  END IF;
END //
DELIMITER ;

CALL _last_login_v1();
DROP PROCEDURE _last_login_v1;
