-- Migration: Phase 6.7 — Manual Password Recovery + Support Tickets
-- Run ONCE against celsopos_db as a privileged user (the app DB user has no DDL).
-- Idempotent — guarded by schema_migrations('pwrecovery_v1'): a second run is a
-- clean no-op. Fresh installs get all of this from schema.sql and skip this file.
-- Requires the multitenant_v1 + billing_bridge_v1 migrations to have run first
-- (this adds the 'superadmin' role / store_id NULL that the recovery flow assumes).
--
-- DEPLOYMENT ORDER:
--   1. Stop the API server.
--   2. Back up the database (mysqldump) — this migration runs DDL.
--   3. Run this migration.
--   4. Deploy the Phase 6.7 backend.
--   5. Start the API server.
--
-- PARTIAL-FAILURE NOTE: MySQL DDL (ALTER TABLE) auto-commits each statement, so
-- this migration is NOT a single atomic transaction. If it aborts midway, the
-- 'pwrecovery_v1' marker is not written; restore the backup from step 2 and re-run
-- from a clean state. On a fully successful run the marker is set and any re-run
-- short-circuits.
--
-- WHAT IT DOES:
--   - users: add mobile, security_answer_hash, pw_reset_expires_at (all NULLABLE,
--            so existing rows are grandfathered untouched). The app requires
--            mobile + security_answer_hash for NEW owner signups only.
--   - Create password_reset_requests (recovery ledger) + support_tickets (inbox).

USE celsopos_db;

-- Idempotency guard (shared marker table; created by earlier migrations too).
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- These two tables match schema.sql; safe to pre-create here (CREATE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(150) NOT NULL,
  submitted_mobile VARCHAR(20)  NOT NULL,
  mobile_match     TINYINT(1)   NOT NULL DEFAULT 0,
  answer_match     TINYINT(1)   NOT NULL DEFAULT 0,
  history_answers  TEXT         DEFAULT NULL,
  user_id          INT          DEFAULT NULL,
  store_id         INT          DEFAULT NULL,
  status           ENUM('pending','approved','completed','rejected','expired') NOT NULL DEFAULT 'pending',
  submitted_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by      INT          DEFAULT NULL,
  reviewed_at      DATETIME     DEFAULT NULL,
  review_note      VARCHAR(255) DEFAULT NULL,
  code_issued_at   DATETIME     DEFAULT NULL,
  code_expires_at  DATETIME     DEFAULT NULL,
  completed_at     DATETIME     DEFAULT NULL,
  KEY idx_pwr_status_submitted (status, submitted_at),
  KEY idx_pwr_email (email),
  KEY idx_pwr_user (user_id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  store_id   INT NOT NULL,
  user_id    INT NOT NULL,
  category   ENUM('bug','question','billing','other') NOT NULL DEFAULT 'other',
  message    TEXT NOT NULL,
  status     ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_by  INT      DEFAULT NULL,
  closed_at  DATETIME DEFAULT NULL,
  KEY idx_tickets_status_created (status, created_at),
  KEY idx_tickets_store (store_id),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

DROP PROCEDURE IF EXISTS _pwrecovery_v1;
DELIMITER //
CREATE PROCEDURE _pwrecovery_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'pwrecovery_v1') THEN

    -- users: three NULLABLE recovery columns (each guarded so a partial prior run
    -- or a manual add doesn't error on a column that already exists).
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                       AND COLUMN_NAME = 'mobile') THEN
      ALTER TABLE users ADD COLUMN mobile VARCHAR(20) DEFAULT NULL AFTER last_login_at;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                       AND COLUMN_NAME = 'security_answer_hash') THEN
      ALTER TABLE users ADD COLUMN security_answer_hash VARCHAR(255) DEFAULT NULL AFTER mobile;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
                       AND COLUMN_NAME = 'pw_reset_expires_at') THEN
      ALTER TABLE users ADD COLUMN pw_reset_expires_at DATETIME DEFAULT NULL AFTER security_answer_hash;
    END IF;

    -- Mark applied.
    INSERT INTO schema_migrations (name) VALUES ('pwrecovery_v1');
  END IF;
END //
DELIMITER ;

CALL _pwrecovery_v1();
DROP PROCEDURE _pwrecovery_v1;
