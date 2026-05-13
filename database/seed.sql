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
