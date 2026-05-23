-- ============================================================
-- Celso POS Seed Data
-- Run AFTER schema.sql. Provides test data for development.
-- Safe to re-run: INSERT IGNORE skips existing rows.
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
-- Demonstrates all four types + utang derivation (borrowed capital minus loan payments)
INSERT IGNORE INTO cash_movements (id, type, category, amount, description, occurred_at, source, recorded_by) VALUES
  (1, 'capital_in', 'borrowed',      5000.00, 'Puhunan mula sa 5-6 lender (Aling Rosa)', '2025-01-10', 'manual', 1),
  (2, 'capital_in', 'own',           2000.00, 'Sariling ipon para sa umpisa ng negosyo',  '2025-01-10', 'manual', 1),
  (3, 'opex',       'rent',           500.00, 'Bayad upa ng espasyo – Enero',             '2025-01-15', 'manual', 1),
  (4, 'opex',       'utilities',      250.00, 'Kuryente – Enero',                         '2025-01-28', 'manual', 1),
  (5, 'owner_draw', 'loan_payment',   500.00, 'Bayad sa 5-6 (Aling Rosa) – 1st installment', '2025-02-05', 'manual', 1),
  (6, 'opex',       'rent',           500.00, 'Bayad upa ng espasyo – Pebrero',           '2025-02-15', 'manual', 1),
  (7, 'owner_draw', 'personal',       300.00, 'Pambayad ng kuryente sa bahay',             '2025-02-20', 'manual', 1),
  (8, 'capex',      'equipment',     1200.00, 'Pangit na ref, binili panibago (ref secondhand)', '2025-03-01', 'manual', 1),
  (9, 'owner_draw', 'loan_payment',   500.00, 'Bayad sa 5-6 (Aling Rosa) – 2nd installment', '2025-03-05', 'manual', 1),
  (10,'opex',       'utilities',      280.00, 'Kuryente – Marso',                         '2025-03-28', 'manual', 1);
