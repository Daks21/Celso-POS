-- ============================================================
-- Celso POS Database Schema
-- Run this file once to set up the entire database.
-- Safe to re-run: IF NOT EXISTS prevents errors.
-- ============================================================

CREATE DATABASE IF NOT EXISTS celsopos_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE celsopos_db;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','cashier') DEFAULT 'cashier',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_id   INT,
  type         ENUM('restock','adjustment','damage','return','sale') NOT NULL,
  qty          INT NOT NULL,
  stock_before INT NOT NULL,
  stock_after  INT NOT NULL,
  notes        TEXT,
  adjusted_by  INT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)  REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (adjusted_by) REFERENCES users(id)    ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_name      ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_sales_created      ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_receipt      ON sales(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_product    ON inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_created    ON inventory_adjustments(created_at);
