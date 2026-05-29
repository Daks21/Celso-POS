-- Migration: Phase 5 cost-capture columns on inventory_adjustments
-- Run once against celsopos_db as a privileged user (the app DB user has no DDL).
-- Fresh installs already get these from schema.sql; this is only for an existing
-- database created before Phase 5. Without these columns, ANY stock adjustment
-- (restock/damage/return/sale logging) fails with "Unknown column 'unit_cost'".
--
-- Note: MySQL 8 does not support ADD COLUMN IF NOT EXISTS, so run this once.
-- If a column already exists, drop its line.

USE celsopos_db;

ALTER TABLE inventory_adjustments
  ADD COLUMN unit_cost      DECIMAL(10,2)               DEFAULT NULL AFTER adjusted_by,
  ADD COLUMN total_paid     DECIMAL(10,2)               DEFAULT NULL AFTER unit_cost,
  ADD COLUMN payment_method ENUM('cash','bank','credit') DEFAULT NULL AFTER total_paid,
  ADD COLUMN supplier_name  VARCHAR(100)                DEFAULT NULL AFTER payment_method;
