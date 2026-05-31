-- ============================================================
-- Celso POS Database Schema  v4.0
-- Run this file once to set up the entire database.
-- Safe to re-run: IF NOT EXISTS prevents errors.
--
-- TIME CONVENTION: all DATETIME columns store UTC. The DB connection
-- pins the session to UTC ('Z'); day-bucketing/display happen in the
-- per-store timezone (stores.timezone) via CONVERT_TZ. The only
-- exception is cash_movements.occurred_at, a user-picked calendar DATE
-- that carries no time and is never timezone-converted.
-- (app_settings is retained for now but superseded by stores.timezone;
--  its reads are retired when loadStore lands in the auth/tenancy step.)
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

-- 0.5 Stores (Phase 6.5 — multi-tenant SaaS)
-- One row per tenant store. Every owned table carries a store_id FK back here,
-- and every query is scoped to the logged-in user's store. Billing state
-- (plan/subscription_status/trial_ends_at + the Lemon Squeezy ids) is mirrored
-- from the Merchant of Record by signed webhooks; the effective plan is resolved
-- from these columns PER REQUEST, never from the JWT. name/address/timezone live
-- here now (per-store), superseding the single-row app_settings.
-- owner_user_id is a plain nullable INT (NO FK) on purpose: a FK here would make
-- stores depend on users while users.store_id already depends on stores, a
-- circular create-order both schema.sql and the registration txn must avoid.
CREATE TABLE IF NOT EXISTS stores (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(120) NOT NULL DEFAULT '',
  address             VARCHAR(120) NOT NULL DEFAULT '',
  timezone            VARCHAR(64)  NOT NULL DEFAULT 'Asia/Manila',
  currency            VARCHAR(8)   NOT NULL DEFAULT 'PHP',
  plan                ENUM('free','plus','pro') NOT NULL DEFAULT 'free',
  subscription_status ENUM('none','trialing','active','past_due','canceled')
                        NOT NULL DEFAULT 'none',
  trial_ends_at       DATETIME    DEFAULT NULL,
  ls_customer_id      VARCHAR(64) DEFAULT NULL,
  ls_subscription_id  VARCHAR(64) DEFAULT NULL,
  owner_user_id       INT         DEFAULT NULL,
  created_at          DATETIME    DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stores_ls_customer (ls_customer_id),
  KEY idx_stores_ls_sub      (ls_subscription_id)
);

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  store_id    INT NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,   -- email stays GLOBALLY unique
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','cashier') DEFAULT 'cashier',
  is_active            TINYINT(1) NOT NULL DEFAULT 1,  -- suspended cashiers can't log in
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,  -- reserved (unused; passwords are admin-managed)
  session_id           VARCHAR(64) DEFAULT NULL,        -- single active session: id of the most recent login
  preferences JSON DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  KEY idx_users_store_role (store_id, role)
);

-- Migration: run once on existing databases
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON DEFAULT NULL;

-- 2. Products
CREATE TABLE IF NOT EXISTS products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  store_id   INT NOT NULL,
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
  KEY idx_products_category (category),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  KEY idx_products_store_name (store_id, name)
);

-- 3. Sales
CREATE TABLE IF NOT EXISTS sales (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  store_id     INT NOT NULL,
  receipt_no   VARCHAR(20) DEFAULT NULL UNIQUE,  -- receipt_no stays GLOBALLY unique (per-store sequence deferred)
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
  FOREIGN KEY (store_id)   REFERENCES stores(id),
  KEY idx_sales_store_created (store_id, created_at),
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
  store_id       INT NOT NULL,
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
  FOREIGN KEY (store_id)    REFERENCES stores(id),
  KEY idx_inv_adj_store_created (store_id, created_at),
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
  store_id    INT NOT NULL,
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
  FOREIGN KEY (recorded_by) REFERENCES users(id)  ON DELETE SET NULL,
  FOREIGN KEY (store_id)    REFERENCES stores(id),
  KEY idx_cash_store_occurred (store_id, occurred_at),
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
