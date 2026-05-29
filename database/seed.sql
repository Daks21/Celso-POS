-- ============================================================
-- Celso POS Seed Data
-- Run AFTER schema.sql. Provides test data for development.
-- Safe to re-run: INSERT IGNORE skips existing rows.
-- NOTE: created_at columns use CURRENT_TIMESTAMP, which is UTC
-- (the session is pinned to 'Z'). occurred_at is a calendar DATE.
-- ============================================================
USE celsopos_db;

-- Users (password = 'admin123')
INSERT IGNORE INTO users (full_name, email, password, role) VALUES
  ('Admin User',   'admin@celsopos.com',
   '$2b$10$d6u5gu.kj1QoEJxoIKmf6Oc7y9yW417hj48hTfs4./99i05qAikXq', 'admin'),
  ('Maria Santos', 'cashier@celsopos.com',
   '$2b$10$d6u5gu.kj1QoEJxoIKmf6Oc7y9yW417hj48hTfs4./99i05qAikXq', 'cashier');

-- Products (matches Phase 2 product.model.js seed data + extras for testing)
INSERT IGNORE INTO products (name, category, price, cost, stock, unit) VALUES
  ('Instant Coffee',    'Beverages',   8.00,  5.00, 100, 'sachet'),
  ('Canned Sardines',   'Food',       15.00, 10.00,  50, 'can'),
  ('Bottled Water',     'Beverages',  15.00,  8.00, 200, 'bottle'),
  ('Laundry Detergent', 'Household',  25.00, 15.00,  80, 'pack'),
  ('Ballpen',           'Stationery', 10.00,  5.00, 150, 'piece'),
  ('Lucky Me Pancit',   'Food',       12.00,  8.00,  40, 'pack'),
  ('Palmolive Shampoo', 'Personal',   49.00, 32.00,  25, 'bottle'),
  ('Bear Brand Milk',   'Beverages',  18.00, 12.00,   4, 'piece'),
  ('Oishi Prawn',       'Snacks',     15.00,  9.00,  60, 'pack'),
  ('Champion Detergent','Household',  32.00, 20.00,   2, 'pack');

-- Phase 5: Sample cash_movements
-- Demonstrates all four types + utang derivation. Debt obligation for a borrowed
-- loan is monthly_due * term_months (interest baked in), drawn down by
-- debt_payment rows. Loan #1 (Aling Rosa, 5-6): ₱5,000 received, repay
-- ₱1,000/mo x 6 = ₱6,000 obligation; ₱2,000 paid so far -> ₱4,000 still owed.
-- Loan #11 (kapitbahay) has no terms, so its obligation falls back to the
-- principal (₱1,000) — demonstrates backward-compatible legacy loans.
INSERT IGNORE INTO cash_movements (id, type, category, amount, monthly_due, term_months, description, occurred_at, source, recorded_by) VALUES
  (1, 'capital_in', 'borrowed',      5000.00, 1000.00,    6, 'Puhunan mula sa 5-6 lender (Aling Rosa) — ₱1,000/buwan x 6', '2025-01-10', 'manual', 1),
  (2, 'capital_in', 'own',           2000.00,    NULL, NULL, 'Sariling ipon para sa umpisa ng negosyo',  '2025-01-10', 'manual', 1),
  (3, 'opex',       'rent',           500.00,    NULL, NULL, 'Bayad upa ng espasyo – Enero',             '2025-01-15', 'manual', 1),
  (4, 'opex',       'utilities',      250.00,    NULL, NULL, 'Kuryente – Enero',                         '2025-01-28', 'manual', 1),
  (5, 'owner_draw', 'debt_payment',  1000.00,    NULL, NULL, 'Bayad sa 5-6 (Aling Rosa) – 1st installment', '2025-02-05', 'manual', 1),
  (6, 'opex',       'rent',           500.00,    NULL, NULL, 'Bayad upa ng espasyo – Pebrero',           '2025-02-15', 'manual', 1),
  (7, 'owner_draw', 'personal',       300.00,    NULL, NULL, 'Pambayad ng kuryente sa bahay',             '2025-02-20', 'manual', 1),
  (8, 'capex',      'equipment',     1200.00,    NULL, NULL, 'Pangit na ref, binili panibago (ref secondhand)', '2025-03-01', 'manual', 1),
  (9, 'owner_draw', 'debt_payment',  1000.00,    NULL, NULL, 'Bayad sa 5-6 (Aling Rosa) – 2nd installment', '2025-03-05', 'manual', 1),
  (10,'opex',       'utilities',      280.00,    NULL, NULL, 'Kuryente – Marso',                         '2025-03-28', 'manual', 1),
  (11,'capital_in', 'borrowed',      1000.00,    NULL, NULL, 'Utang sa kapitbahay (walang interes, walang termino)', '2025-03-22', 'manual', 1);

-- Phase 5: Sample sales history, spread across 2025–2026 so the Finance Profit
-- card has realistic period-over-period data (2025 earns instead of being a
-- sales-less loss year, so All Time >= any sub-period as owners expect).
-- Tax is off here for simple math (total = subtotal). Each sale also gets a
-- matching sales_revenue cash_movement (source='sale') so Money In and the
-- cashflow list stay consistent. Explicit IDs keep INSERT IGNORE re-runnable.
INSERT IGNORE INTO sales (id, receipt_no, subtotal, tax, tax_rate, cart_tax_on, total, payment, change_given, cashier_id, created_at) VALUES
  (1, 'RCPT-100001',  840.00, 0.00, 0.00, 0,  840.00,  840.00,  0.00, 2, '2025-02-10 09:30:00'),
  (2, 'RCPT-100002',  794.00, 0.00, 0.00, 0,  794.00,  800.00,  6.00, 2, '2025-04-18 14:10:00'),
  (3, 'RCPT-100003', 1500.00, 0.00, 0.00, 0, 1500.00, 1500.00,  0.00, 2, '2025-06-22 11:05:00'),
  (4, 'RCPT-100004', 1500.00, 0.00, 0.00, 0, 1500.00, 1500.00,  0.00, 2, '2025-08-09 12:45:00'),
  (5, 'RCPT-100005', 1350.00, 0.00, 0.00, 0, 1350.00, 1350.00,  0.00, 2, '2025-10-15 10:20:00'),
  (6, 'RCPT-100006', 1530.00, 0.00, 0.00, 0, 1530.00, 1530.00,  0.00, 2, '2025-12-05 13:00:00'),
  (7, 'RCPT-100007',  990.00, 0.00, 0.00, 0,  990.00, 1000.00, 10.00, 2, '2026-01-20 08:50:00'),
  (8, 'RCPT-100008',  695.00, 0.00, 0.00, 0,  695.00,  700.00,  5.00, 2, '2026-03-14 15:30:00');

INSERT IGNORE INTO sale_items (id, sale_id, product_id, product_name, unit_price, quantity, line_total) VALUES
  ( 1, 1,  3, 'Bottled Water',      15.00, 40, 600.00),
  ( 2, 1,  1, 'Instant Coffee',      8.00, 30, 240.00),
  ( 3, 2,  4, 'Laundry Detergent',  25.00, 20, 500.00),
  ( 4, 2,  7, 'Palmolive Shampoo',  49.00,  6, 294.00),
  ( 5, 3,  8, 'Bear Brand Milk',    18.00, 50, 900.00),
  ( 6, 3,  9, 'Oishi Prawn',        15.00, 40, 600.00),
  ( 7, 4,  3, 'Bottled Water',      15.00, 60, 900.00),
  ( 8, 4,  2, 'Canned Sardines',    15.00, 40, 600.00),
  ( 9, 5,  4, 'Laundry Detergent',  25.00, 30, 750.00),
  (10, 5,  6, 'Lucky Me Pancit',    12.00, 50, 600.00),
  (11, 6,  7, 'Palmolive Shampoo',  49.00, 10, 490.00),
  (12, 6, 10, 'Champion Detergent', 32.00, 20, 640.00),
  (13, 6,  1, 'Instant Coffee',      8.00, 50, 400.00),
  (14, 7,  3, 'Bottled Water',      15.00, 30, 450.00),
  (15, 7,  8, 'Bear Brand Milk',    18.00, 30, 540.00),
  (16, 8,  4, 'Laundry Detergent',  25.00, 15, 375.00),
  (17, 8,  1, 'Instant Coffee',      8.00, 40, 320.00);

-- Mirror each sale into cash_movements as sales_revenue (what the POS does on
-- checkout). source_id links back to the sale; occurred_at is the sale's date.
INSERT IGNORE INTO cash_movements (id, type, category, amount, monthly_due, term_months, description, occurred_at, source, source_id, recorded_by) VALUES
  (12, 'sales_revenue', NULL,  840.00, NULL, NULL, 'Benta – RCPT-100001', '2025-02-10', 'sale', 1, 2),
  (13, 'sales_revenue', NULL,  794.00, NULL, NULL, 'Benta – RCPT-100002', '2025-04-18', 'sale', 2, 2),
  (14, 'sales_revenue', NULL, 1500.00, NULL, NULL, 'Benta – RCPT-100003', '2025-06-22', 'sale', 3, 2),
  (15, 'sales_revenue', NULL, 1500.00, NULL, NULL, 'Benta – RCPT-100004', '2025-08-09', 'sale', 4, 2),
  (16, 'sales_revenue', NULL, 1350.00, NULL, NULL, 'Benta – RCPT-100005', '2025-10-15', 'sale', 5, 2),
  (17, 'sales_revenue', NULL, 1530.00, NULL, NULL, 'Benta – RCPT-100006', '2025-12-05', 'sale', 6, 2),
  (18, 'sales_revenue', NULL,  990.00, NULL, NULL, 'Benta – RCPT-100007', '2026-01-20', 'sale', 7, 2),
  (19, 'sales_revenue', NULL,  695.00, NULL, NULL, 'Benta – RCPT-100008', '2026-03-14', 'sale', 8, 2);
