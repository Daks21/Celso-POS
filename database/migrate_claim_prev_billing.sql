-- Migration: payment_claims.prev_billing (operator "undo approval" support)
-- Run ONCE against celsopos_db as a privileged user (the app DB user has no DDL).
-- Idempotent — guarded by schema_migrations('claim_prev_billing_v1') + an
-- information_schema column check, so a second run is a clean no-op. Fresh installs
-- get the column from schema.sql and skip this file.
--
-- DEPLOYMENT ORDER:
--   1. Stop the API server.
--   2. Run this migration.
--   3. Deploy the backend that snapshots prev_billing on approve + supports revert.
--   4. Start the API server.
--
-- WHAT IT DOES:
--   - payment_claims: add prev_billing JSON — a snapshot of the store's billing
--     fields { plan, subscription_status, paid_until, trial_ends_at } captured at
--     approval time, so a mistaken approval can be reverted (POST /api/admin/
--     claims/:id/revert) and the store restored exactly. Approvals made before
--     this ships have NULL prev_billing and can't be auto-reverted.

USE celsopos_db;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP PROCEDURE IF EXISTS _claim_prev_billing_v1;
DELIMITER //
CREATE PROCEDURE _claim_prev_billing_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'claim_prev_billing_v1') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_claims'
                       AND COLUMN_NAME = 'prev_billing') THEN
      ALTER TABLE payment_claims ADD COLUMN prev_billing JSON DEFAULT NULL AFTER period_end;
    END IF;
    INSERT INTO schema_migrations (name) VALUES ('claim_prev_billing_v1');
  END IF;
END //
DELIMITER ;

CALL _claim_prev_billing_v1();
DROP PROCEDURE _claim_prev_billing_v1;
