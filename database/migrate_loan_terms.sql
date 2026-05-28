-- Migration: Borrowed-loan repayment terms on cash_movements
-- Run once against celsopos_db.
-- Adds two nullable columns used to compute the Debt Balance as a loan's full
-- repayable amount (monthly_due * term_months, interest baked in) for borrowed
-- capital. NULL on every other row, and on legacy borrowed rows the debt calc
-- falls back to `amount` (the principal). Fresh installs already get these via
-- schema.sql; this migration is only for an existing database.

USE celsopos_db;

ALTER TABLE cash_movements
  ADD COLUMN monthly_due DECIMAL(10,2) DEFAULT NULL AFTER amount,
  ADD COLUMN term_months INT           DEFAULT NULL AFTER monthly_due;
