-- Migration: Phase 6.5 — Multi-Tenant SaaS (stores + store_id everywhere)
-- Run ONCE against celsopos_db as a privileged user (the app DB user has no DDL).
-- Idempotent — guarded by schema_migrations('multitenant_v1'): a second run is a
-- clean no-op. Fresh installs get all of this from schema.sql and skip this file.
--
-- DEPLOYMENT ORDER (important):
--   1. Stop the API server.
--   2. Back up the database (mysqldump) — this migration runs DDL.
--   3. Run this migration.
--   4. Deploy the Phase 6.5 backend (JWT carries storeId, loadStore is wired).
--   5. Start the API server.
--
-- PARTIAL-FAILURE NOTE: MySQL DDL (ALTER TABLE) auto-commits each statement, so
-- this migration is NOT a single atomic transaction. If it aborts midway, the
-- 'multitenant_v1' marker is not written; restore the backup from step 2 and
-- re-run from a clean state. On a fully successful run the marker is set and any
-- re-run short-circuits.
--
-- WHAT IT DOES:
--   - Creates the stores table and a default store (id=1) for this install.
--   - Seeds store name/address from the first admin's saved Store Info
--     (users.preferences JSON), timezone from app_settings.
--   - Adds store_id to every owned table, backfills it to 1, then enforces
--     NOT NULL + FK + composite keys.
--   - Adds users.is_active + users.must_change_password (Team/seat support).
--
-- PLAN OF THE MIGRATED STORE: this install was single-tenant with EVERY feature
-- unlocked. To avoid regressing the existing owner to Free, store id=1 is seeded
-- plan='pro', subscription_status='active'. Change it later in the DB (or via
-- billing) if you want this store on a different tier.

USE celsopos_db;

-- Idempotency guard (shared marker table; created by earlier migrations too).
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- stores table (matches schema.sql; safe to pre-create here).
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

DROP PROCEDURE IF EXISTS _multitenant_v1;
DELIMITER //
CREATE PROCEDURE _multitenant_v1()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'multitenant_v1') THEN

    -- 1. Default store for this install (id=1). Seed identity from the first
    --    admin's saved Store Info; timezone from app_settings. plan/status set
    --    to pro/active so the existing owner keeps full feature access.
    INSERT INTO stores (id, name, address, timezone, plan, subscription_status)
    SELECT 1,
      COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.storeName'))
                  FROM users WHERE role = 'admin' AND JSON_EXTRACT(preferences, '$.storeName') IS NOT NULL
                  ORDER BY id LIMIT 1), ''),
      COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.storeAddress'))
                  FROM users WHERE role = 'admin' AND JSON_EXTRACT(preferences, '$.storeAddress') IS NOT NULL
                  ORDER BY id LIMIT 1), ''),
      COALESCE((SELECT timezone FROM app_settings WHERE id = 1), 'Asia/Manila'),
      'pro', 'active'
    WHERE NOT EXISTS (SELECT 1 FROM stores WHERE id = 1);

    -- 2. Add store_id (nullable first) + the new users columns.
    ALTER TABLE users
      ADD COLUMN store_id INT NULL AFTER id,
      ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
      ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
    ALTER TABLE products              ADD COLUMN store_id INT NULL AFTER id;
    ALTER TABLE sales                 ADD COLUMN store_id INT NULL AFTER id;
    ALTER TABLE inventory_adjustments ADD COLUMN store_id INT NULL AFTER id;
    ALTER TABLE cash_movements        ADD COLUMN store_id INT NULL AFTER id;

    -- 3. Backfill every existing owned row to the default store.
    UPDATE users                 SET store_id = 1 WHERE store_id IS NULL;
    UPDATE products              SET store_id = 1 WHERE store_id IS NULL;
    UPDATE sales                 SET store_id = 1 WHERE store_id IS NULL;
    UPDATE inventory_adjustments SET store_id = 1 WHERE store_id IS NULL;
    UPDATE cash_movements        SET store_id = 1 WHERE store_id IS NULL;

    -- 4. Enforce NOT NULL + FK + composite keys now that no NULLs remain.
    ALTER TABLE users
      MODIFY store_id INT NOT NULL,
      ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id),
      ADD KEY idx_users_store_role (store_id, role);
    ALTER TABLE products
      MODIFY store_id INT NOT NULL,
      ADD CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores(id),
      ADD KEY idx_products_store_name (store_id, name);
    ALTER TABLE sales
      MODIFY store_id INT NOT NULL,
      ADD CONSTRAINT fk_sales_store FOREIGN KEY (store_id) REFERENCES stores(id),
      ADD KEY idx_sales_store_created (store_id, created_at);
    ALTER TABLE inventory_adjustments
      MODIFY store_id INT NOT NULL,
      ADD CONSTRAINT fk_inv_adj_store FOREIGN KEY (store_id) REFERENCES stores(id),
      ADD KEY idx_inv_adj_store_created (store_id, created_at);
    ALTER TABLE cash_movements
      MODIFY store_id INT NOT NULL,
      ADD CONSTRAINT fk_cash_store FOREIGN KEY (store_id) REFERENCES stores(id),
      ADD KEY idx_cash_store_occurred (store_id, occurred_at);

    -- 5. Point the store at its owner (the first admin).
    UPDATE stores
       SET owner_user_id = (SELECT MIN(id) FROM users WHERE role = 'admin')
     WHERE id = 1;

    -- 6. Mark applied.
    INSERT INTO schema_migrations (name) VALUES ('multitenant_v1');
  END IF;
END //
DELIMITER ;

CALL _multitenant_v1();
DROP PROCEDURE _multitenant_v1;
