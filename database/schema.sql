-- ============================================================
-- Celso POS Database Schema  v4.0
-- Run this file once to set up the entire database.
-- Safe to re-run: IF NOT EXISTS prevents errors.
--
-- TIME CONVENTION: all DATETIME columns store UTC. The DB connection
-- pins the session to UTC ('Z'); day-bucketing/display happen in the
-- store timezone (app_settings.timezone) via CONVERT_TZ. The only
-- exception is cash_movements.occurred_at, a user-picked calendar DATE
-- that carries no time and is never timezone-converted.
-- ============================================================

CREATE DATABASE IF NOT EXISTS celsopos_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE celsopos_db;

-- 0. App Settings (single-row, store-wide configuration)
-- Holds the store timezone. All timestamps are stored in UTC; this
-- value controls how UTC instants are bucketed into calendar days and
-- displayed. Store-wide (not per-user): every staff member of one store
-- shares the same "today".
CREATE TABLE IF NOT EXISTS app_settings (
  id         TINYINT      NOT NULL PRIMARY KEY,   -- always 1
  timezone   VARCHAR(64)  NOT NULL DEFAULT 'Asia/Manila',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO app_settings (id, timezone) VALUES (1, 'Asia/Manila');

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','cashier') DEFAULT 'cashier',
  preferences JSON DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration: run once on existing databases
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON DEFAULT NULL;

-- 2. Products
CREATE TABLE IF NOT EXISTS products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  category   VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  cost       DECIMAL(10,2) DEFAULT 0.00,
  stock      INT DEFAULT 0,
  unit       ENUM('piece','pack','bottle','can','sachet','box','kg','liter')
             NOT NULL DEFAULT 'piece',
  is_active  TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_name     (name),
  KEY idx_products_category (category)
);

-- 3. Sales
CREATE TABLE IF NOT EXISTS sales (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no   VARCHAR(20) DEFAULT NULL UNIQUE,
  subtotal     DECIMAL(10,2) NOT NULL,
  tax          DECIMAL(10,2) DEFAULT 0.00,
  tax_rate     DECIMAL(5,4)  DEFAULT 0.0000,
  cart_tax_on  TINYINT(1)    DEFAULT 0,
  total        DECIMAL(10,2) NOT NULL,
  payment      DECIMAL(10,2) NOT NULL,
  change_given DECIMAL(10,2) NOT NULL,
  cashier_id   INT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT,
  KEY idx_sales_created (created_at)
  -- receipt_no is already indexed by its UNIQUE constraint above
);

-- 4. Sale Items (junction table)
CREATE TABLE IF NOT EXISTS sale_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  sale_id      INT NOT NULL,
  product_id   INT,
  product_name VARCHAR(150) NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  quantity     INT NOT NULL,
  line_total   DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  KEY idx_sale_items_sale    (sale_id),
  KEY idx_sale_items_product (product_id)
);

-- 5. Inventory Adjustments (audit log)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     INT,
  type           ENUM('restock','adjustment','damage','return','sale') NOT NULL,
  qty            INT NOT NULL,
  stock_before   INT NOT NULL,
  stock_after    INT NOT NULL,
  notes          TEXT,
  adjusted_by    INT,
  unit_cost      DECIMAL(10,2) DEFAULT NULL,
  total_paid     DECIMAL(10,2) DEFAULT NULL,
  payment_method ENUM('cash','bank','credit') DEFAULT NULL,
  supplier_name  VARCHAR(100)  DEFAULT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)  REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (adjusted_by) REFERENCES users(id)    ON DELETE SET NULL,
  KEY idx_inv_adj_product (product_id),
  KEY idx_inv_adj_created (created_at)
);

-- Migration for existing databases (run once):
-- ALTER TABLE inventory_adjustments
--   ADD COLUMN IF NOT EXISTS unit_cost      DECIMAL(10,2) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS total_paid     DECIMAL(10,2) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS payment_method ENUM('cash','bank','credit') DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS supplier_name  VARCHAR(100)  DEFAULT NULL;

-- 6. Cash Movements (Phase 5 — Finance Module)
CREATE TABLE IF NOT EXISTS cash_movements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  type        ENUM('capital_in','owner_draw','opex','capex','sales_revenue') NOT NULL,
  category    VARCHAR(100)  DEFAULT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  -- Repayment terms — set only for capital_in/borrowed. The total obligation
  -- (monthly_due * term_months) drives the Debt Balance and may exceed `amount`
  -- (the principal/cash received) by the loan's interest. NULL on every other
  -- row, and on legacy borrowed rows the debt calc falls back to `amount`.
  monthly_due DECIMAL(10,2) DEFAULT NULL,
  term_months INT           DEFAULT NULL,
  description TEXT,
  occurred_at DATE NOT NULL,
  source      ENUM('manual','restock','sale') DEFAULT 'manual',
  source_id   INT DEFAULT NULL,
  recorded_by INT DEFAULT NULL,
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_cash_type     (type),
  KEY idx_cash_category (category),
  KEY idx_cash_occurred (occurred_at),
  KEY idx_cash_source   (source_id)
);

-- Indexes are declared inline in each CREATE TABLE above (as KEY clauses) so
-- this whole file stays idempotent: MySQL has no CREATE INDEX IF NOT EXISTS, so
-- standalone CREATE INDEX statements would throw "Duplicate key name" on a
-- second run, whereas CREATE TABLE IF NOT EXISTS skips an existing table (and
-- its inline keys) cleanly.
