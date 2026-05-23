-- Migration: Sales Revenue in Cash Movements
-- Run once against celsopos_db.
-- Safe to re-run: the INSERT uses NOT EXISTS to avoid duplicates.

USE celsopos_db;

-- 1. Expand the type ENUM to include sales_revenue
ALTER TABLE cash_movements
  MODIFY COLUMN type ENUM('capital_in','owner_draw','opex','capex','sales_revenue') NOT NULL;

-- 2. Expand the source ENUM to include sale
ALTER TABLE cash_movements
  MODIFY COLUMN source ENUM('manual','restock','sale') DEFAULT 'manual';

-- 3. Backfill all existing sales (skips any already inserted)
INSERT INTO cash_movements
  (type, category, amount, description, occurred_at, source, source_id, recorded_by)
SELECT
  'sales_revenue',
  NULL,
  s.total,
  CONCAT('Sale ', s.receipt_no),
  DATE(s.created_at),
  'sale',
  s.id,
  s.cashier_id
FROM sales s
WHERE NOT EXISTS (
  SELECT 1 FROM cash_movements cm
  WHERE cm.source = 'sale' AND cm.source_id = s.id
);
