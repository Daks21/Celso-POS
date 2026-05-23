-- ============================================================
-- Celso POS Database Schema  v4.0
-- Run this file once to set up the entire database.
-- Safe to re-run: IF NOT EXISTS prevents errors.
-- ============================================================

CREATE DATABASE IF NOT EXISTS celsopos_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE celsopos_db;

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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT
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
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
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
  FOREIGN KEY (adjusted_by) REFERENCES users(id)    ON DELETE SET NULL
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
  description TEXT,
  occurred_at DATE NOT NULL,
  source      ENUM('manual','restock','sale') DEFAULT 'manual',
  source_id   INT DEFAULT NULL,
  recorded_by INT DEFAULT NULL,
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_products_name      ON products(name);
CREATE INDEX idx_products_category  ON products(category);
CREATE INDEX idx_sales_created      ON sales(created_at);
CREATE INDEX idx_sales_receipt      ON sales(receipt_no);
CREATE INDEX idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
CREATE INDEX idx_inv_adj_product    ON inventory_adjustments(product_id);
CREATE INDEX idx_inv_adj_created    ON inventory_adjustments(created_at);
CREATE INDEX idx_cash_type          ON cash_movements(type);
CREATE INDEX idx_cash_category      ON cash_movements(category);
CREATE INDEX idx_cash_occurred      ON cash_movements(occurred_at);
CREATE INDEX idx_cash_source        ON cash_movements(source_id);
