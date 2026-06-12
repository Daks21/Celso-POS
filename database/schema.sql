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
-- (plan/subscription_status/paid_until) is the source of truth and the effective
-- plan is resolved from these columns PER REQUEST, never from the JWT. Phase 6.6:
-- a manual GCash bridge sets plan + paid_until on operator approval; entitlement
-- runs while now <= paid_until + grace (config/plans.js). There is NO trial: new
-- stores start on Free. trial_ends_at + the 'trialing' status are RETAINED but
-- unused (like the ls_* columns), kept nullable for a clean future migration.
-- ls_customer_id/ls_subscription_id are LEGACY (Lemon Squeezy, retired) — kept
-- nullable/unused for a clean future migration to a real provider (PayMongo).
-- name/address/timezone live here now (per-store), superseding app_settings.
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
  paid_until          DATETIME    DEFAULT NULL,   -- end of the current paid period (6.6)
  ls_customer_id      VARCHAR(64) DEFAULT NULL,   -- legacy (Lemon Squeezy, retired)
  ls_subscription_id  VARCHAR(64) DEFAULT NULL,   -- legacy (Lemon Squeezy, retired)
  owner_user_id       INT         DEFAULT NULL,
  created_at          DATETIME    DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stores_ls_customer (ls_customer_id),
  KEY idx_stores_ls_sub      (ls_subscription_id)
);

-- 0.6 Payment claims (Phase 6.6 — manual GCash billing bridge)
-- The billing ledger + audit trail. An owner pays the global GCash QR, then
-- submits the GCash reference number in-app (identity comes from the session).
-- The claim is `pending` (verify-first) until the platform super-admin approves
-- it in admin.html; approval sets the store's plan + paid_until and reconciles
-- cashier seats, all in one transaction. A gcash_ref can be claimed once, ever.
CREATE TABLE IF NOT EXISTS payment_claims (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  store_id     INT NOT NULL,
  plan         ENUM('plus','pro') NOT NULL,
  amount_php   INT NOT NULL,                       -- price snapshot at submit time
  gcash_ref    VARCHAR(32) NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by INT NOT NULL,                       -- owner user id
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by  INT         DEFAULT NULL,           -- super-admin user id
  reviewed_at  DATETIME    DEFAULT NULL,
  review_note  VARCHAR(255) DEFAULT NULL,
  period_start DATETIME    DEFAULT NULL,           -- set on approve
  period_end   DATETIME    DEFAULT NULL,           -- set on approve (= new paid_until)
  prev_billing JSON        DEFAULT NULL,           -- store billing snapshot at approve, for revert/undo (6.6)
  UNIQUE KEY uniq_gcash_ref (gcash_ref),
  KEY idx_claims_store_status (store_id, status),
  KEY idx_claims_status_submitted (status, submitted_at),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- 0.7 Platform config (Phase 6.6 — single global row)
-- Holds the receiving GCash QR (uploaded/replaced by the super-admin in
-- admin.html) and the receiving account name/number shown in the Upgrade modal.
CREATE TABLE IF NOT EXISTS platform_config (
  id            TINYINT      NOT NULL PRIMARY KEY,  -- always 1
  gcash_qr      MEDIUMTEXT   DEFAULT NULL,          -- QR as a data-URL (survives redeploys); served by GET /api/billing/qr
  gcash_name    VARCHAR(120) DEFAULT NULL,
  gcash_number  VARCHAR(32)  DEFAULT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO platform_config (id) VALUES (1);

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  store_id    INT NULL,                       -- NULL ONLY for the platform super-admin (6.6); app enforces NOT NULL for tenant users
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,   -- email stays GLOBALLY unique
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin','cashier','superadmin') DEFAULT 'cashier',  -- superadmin = platform operator (no tenant)
  is_active            TINYINT(1) NOT NULL DEFAULT 1,  -- suspended cashiers can't log in
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,  -- force a password change on next login (USED by Phase 6.7 recovery)
  session_id           VARCHAR(64) DEFAULT NULL,        -- single active session: id of the most recent login
  last_login_at        DATETIME    DEFAULT NULL,         -- stamped on each successful login (operator activity stats)
  -- Phase 6.7 manual password recovery (owner self-service). NULL for cashiers
  -- (the owner resets them on the Team page) and the platform super-admin.
  mobile               VARCHAR(20)  DEFAULT NULL,        -- PH format; required for NEW owners; verification + on-file call-back channel
  security_answer_hash VARCHAR(255) DEFAULT NULL,        -- bcrypt(normalized place of birth); never stored in clear
  pw_reset_expires_at  DATETIME     DEFAULT NULL,        -- expiry of an issued temp reset code (cleared once the owner sets a new password)
  preferences JSON DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  KEY idx_users_store_role (store_id, role)
);

-- Migration: run once on existing databases
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON DEFAULT NULL;

-- 1.1 Password reset requests (Phase 6.7 — manual recovery bridge)
-- The recovery ledger + audit trail. A locked-out OWNER submits email + mobile +
-- place-of-birth + free-text history answers via the public forgot-password form;
-- the row is `pending` (verify-first) until the platform super-admin reviews it in
-- admin.html. We store only MATCH BOOLEANS (mobile_match / answer_match), never the
-- raw secrets. Approve issues a one-time temp code (delivered out-of-band to the
-- on-file mobile) and the row advances pending -> approved -> completed; reject ->
-- rejected; an approved code past its expiry shows as 'expired'. Dedupe of OPEN
-- requests is enforced in code (no UNIQUE on email). No FK on user_id — a request
-- may be unmatched (unknown email / non-owner), mirroring the no-FK pragmatism used
-- elsewhere (owner_user_id).
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(150) NOT NULL,            -- as submitted (not necessarily a real account)
  submitted_mobile VARCHAR(20)  NOT NULL,            -- as submitted (display + match only; NEVER the delivery number)
  mobile_match     TINYINT(1)   NOT NULL DEFAULT 0,  -- submitted == on-file mobile
  answer_match     TINYINT(1)   NOT NULL DEFAULT 0,  -- hashed place-of-birth compare
  history_answers  TEXT         DEFAULT NULL,        -- free text the user typed (operator eyeballs vs live data)
  user_id          INT          DEFAULT NULL,        -- resolved owner match (NULL = no account / not an owner)
  store_id         INT          DEFAULT NULL,
  status           ENUM('pending','approved','completed','rejected','expired') NOT NULL DEFAULT 'pending',
  submitted_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by      INT          DEFAULT NULL,        -- super-admin user id
  reviewed_at      DATETIME     DEFAULT NULL,
  review_note      VARCHAR(255) DEFAULT NULL,
  code_issued_at   DATETIME     DEFAULT NULL,        -- set on approve/regenerate
  code_expires_at  DATETIME     DEFAULT NULL,        -- snapshot of the temp code's expiry
  completed_at     DATETIME     DEFAULT NULL,        -- set when the owner finishes the forced change
  KEY idx_pwr_status_submitted (status, submitted_at),
  KEY idx_pwr_email (email),
  KEY idx_pwr_user (user_id)
);

-- 1.2 Support tickets (Phase 6.7 — one-way inbox)
-- An owner submits a free-text issue from Account Settings; it is AUTO-TAGGED with
-- the submitting user_id + store_id (from the session). The platform super-admin
-- reads them in admin.html and can mark them closed. One-way for v1 (no reply
-- thread / chat). store_id is FK'd; user_id is a plain tag (no FK) so deleting a
-- cashier never blocks on a ticket.
CREATE TABLE IF NOT EXISTS support_tickets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  store_id   INT NOT NULL,
  user_id    INT NOT NULL,
  category   ENUM('bug','question','billing','other') NOT NULL DEFAULT 'other',
  message    TEXT NOT NULL,
  status     ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_by  INT      DEFAULT NULL,
  closed_at  DATETIME DEFAULT NULL,
  KEY idx_tickets_status_created (status, created_at),
  KEY idx_tickets_store (store_id),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

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
