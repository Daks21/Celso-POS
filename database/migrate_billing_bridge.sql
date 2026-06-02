-- Migration: Phase 6.6 — Manual GCash Billing Bridge
-- Run ONCE against celsopos_db as a privileged user (the app DB user has no DDL).
-- Idempotent — guarded by schema_migrations('billing_bridge_v1'): a second run is
-- a clean no-op. Fresh installs get all of this from schema.sql and skip this file.
-- Requires the multitenant_v1 migration (stores/users) to have run first.
--
-- DEPLOYMENT ORDER:
--   1. Stop the API server.
--   2. Back up the database (mysqldump) — this migration runs DDL.
--   3. Run this migration.
--   4. Deploy the Phase 6.6 backend.
--   5. Start the API server.  (Seed the super-admin via scripts/create-superadmin.js.)
--
-- PARTIAL-FAILURE NOTE: MySQL DDL (ALTER TABLE) auto-commits each statement, so
-- this migration is NOT a single atomic transaction. If it aborts midway, the
-- 'billing_bridge_v1' marker is not written; restore the backup from step 2 and
-- re-run from a clean state. On a fully successful run the marker is set and any
-- re-run short-circuits.
--
-- WHAT IT DOES:
--   - stores: add paid_until (current paid-period end).
--   - users:  allow store_id NULL (only the platform super-admin) and add
--             'superadmin' to the role enum. Existing tenant rows are untouched
--             (they keep their store_id); the app enforces NOT NULL for tenants.
--   - Create payment_claims (billing ledger) + platform_config (global GCash QR).
--   - The existing single-tenant store (id=1) was seeded pro/active with NO
--     paid_until; config/plans.resolveBilling grandfathers 'active' + NULL
--     paid_until as entitled, so it keeps full access — nothing to backfill here.

USE celsopos_db;

-- Idempotency guard (shared marker table; created by earlier migrations too).
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- payment_claims + platform_config match schema.sql; safe to pre-create here.
CREATE TABLE IF NOT EXISTS payment_claims (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  store_id     INT NOT NULL,
  plan         ENUM('plus','pro') NOT NULL,
  amount_php   INT NOT NULL,
  gcash_ref    VARCHAR(32) NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by INT NOT NULL,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by  INT         DEFAULT NULL,
  reviewed_at  DATETIME    DEFAULT NULL,
  review_note  VARCHAR(255) DEFAULT NULL,
  period_start DATETIME    DEFAULT NULL,
  period_end   DATETIME    DEFAULT NULL,
  UNIQUE KEY uniq_gcash_ref (gcash_ref),
  KEY idx_claims_store_status (store_id, status),
  KEY idx_claims_status_submitted (status, submitted_at),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS platform_config (
  id            TINYINT      NOT NULL PRIMARY KEY,
  gcash_qr_path VARCHAR(255) DEFAULT NULL,
  gcash_name    VARCHAR(120) DEFAULT NULL,
  gcash_number  VARCHAR(32)  DEFAULT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO platform_config (id) VALUES (1);

DROP PROCEDURE IF EXISTS _billing_bridge_v1;
DELIMITER //
CREATE PROCEDURE _billing_bridge_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'billing_bridge_v1') THEN

    -- 1. stores: current paid-period end (NULL = no paid period).
    ALTER TABLE stores ADD COLUMN paid_until DATETIME DEFAULT NULL AFTER trial_ends_at;

    -- 2. users: permit the no-tenant platform super-admin + extend the role enum.
    --    Dropping NOT NULL keeps the existing FK (NULLs skip the FK check).
    ALTER TABLE users MODIFY store_id INT NULL;
    ALTER TABLE users MODIFY role ENUM('admin','cashier','superadmin') DEFAULT 'cashier';

    -- 3. Mark applied.
    INSERT INTO schema_migrations (name) VALUES ('billing_bridge_v1');
  END IF;
END //
DELIMITER ;

CALL _billing_bridge_v1();
DROP PROCEDURE _billing_bridge_v1;
