================================================================
  Celso POS v4.0
  SARI-SARI STORE POS + INVENTORY + SALES MANAGEMENT SYSTEM
================================================================

================================================================
[1. PROJECT TITLE & OVERVIEW]
================================================================

  PROJECT NAME  : Celso POS

  TAGLINE       : A simple, powerful POS and inventory system
                  built for Filipino sari-sari stores and MSMEs.

  PURPOSE       :
    - Help small business owners manage products and stock
    - Record and track sales quickly (POS-style)
    - Generate receipts and view sales history
    - Provide a dashboard and analytics for business insights
    - Track capital, expenses, withdrawals, and outstanding utang
      (cashflow log — money in / money out / net / utang balance)
    - AI assistant for smart restock and business recommendations

  TARGET USERS  :
    - Sari-sari store owners
    - Small retail shop owners
    - MSMEs with no technical background
    - Anyone needing a simple POS without expensive software

  WHAT MAKES IT DIFFERENT:
    - Built specifically for Filipino MSME needs
    - Simple UI, no overwhelming features
    - Tracks borrowed capital and utang balance — a real PH MSME
      need most POS apps ignore
    - Scales from basic to AI-powered over time
    - Multi-tenant SaaS (Phase 6.5): each signup gets its own ISOLATED
      store on a free/basic/plus/pro plan; paid plans run on a manual
      GCash bridge (Phase 6.6; PayMongo once registered + at scale)
    - Open and learnable — built step by step

================================================================
[2. SYSTEM ARCHITECTURE]
================================================================

  OVERVIEW:
    The system is divided into 4 layers.
    Each layer has a specific job and communicates
    only with the layers next to it.

  ┌─────────────────────────────────────────────┐
  │           LAYER 1: FRONTEND                 │
  │   What the user sees and interacts with     │
  │   Tech: HTML → CSS → JS → React (later)    │
  └─────────────────────┬───────────────────────┘
                        │  HTTP Requests (fetch/axios)
                        ▼
  ┌─────────────────────────────────────────────┐
  │           LAYER 2: BACKEND                  │
  │   Processes requests, applies rules/logic   │
  │   Tech: Node.js + Express                   │
  └────────────┬──────────────────┬─────────────┘
               │                  │
               ▼                  ▼
  ┌────────────────────┐  ┌───────────────────────┐
  │  LAYER 3: DATABASE │  │  LAYER 4: AI (PHASE 4) │
  │  Stores all data   │  │  Reads data, gives    │
  │  permanently       │  │  smart suggestions    │
  │  Tech: MySQL 8     │  │  Tech: Groq API       │
  └────────────────────┘  └───────────────────────┘

  HOW THEY CONNECT:
    1. User opens browser → sees FRONTEND
    2. User clicks "Add Sale" → FRONTEND sends request to BACKEND
    3. BACKEND validates the request and writes to DATABASE
    4. DATABASE confirms → BACKEND responds to FRONTEND
    5. FRONTEND updates what the user sees
    6. BACKEND fetches data → sends to Groq AI → returns insight

  ANALOGY:
    Think of it like a restaurant:
    - Frontend   = Dining area (what customers see)
    - Backend    = Kitchen (where the cooking/logic happens)
    - Database   = Storage/pantry (where ingredients are kept)
    - AI Layer   = Head chef advisor (reads everything, gives tips)

  COMMUNICATION FORMAT:
    - Frontend ↔ Backend : JSON over HTTP (REST API)
    - Backend  ↔ Database: SQL queries via mysql2 (prepared statements)
    - Backend  ↔ AI      : OpenAI-compatible REST calls to Groq API

================================================================
[3. PROJECT STRUCTURE]
================================================================

  STRATEGY: Frontend → Backend → Database → AI → Finance → Deployment.
  All code lives in ONE root folder: Celso_POS/

  ROOT FOLDER LAYOUT:
  ─────────────────────────────────────────────────────────────
  Celso_POS/
  │
  ├── frontend/                ← Everything the user sees
  ├── backend/                 ← Server, routes, logic (Phase 2+3 COMPLETE)
  ├── database/                ← SQL schema, seed, and migrations (Phase 3 COMPLETE)
  ├── ai/                      ← AI assistant (Phase 4 COMPLETE)
  ├── scripts/                 ← Dev/deploy tooling (e.g. cache-busting)
  │
  ├── .gitignore               ← Files to exclude from Git
  └── README.md                ← This file
  ─────────────────────────────────────────────────────────────

  DETAILED BREAKDOWN:
  ─────────────────────────────────────────────────────────────

  frontend/
  │
  │  PURPOSE: All HTML, CSS, and JavaScript for the user interface.
  │           Each page has its own HTML file.
  │           CSS is split by responsibility; JS by feature.
  │
  ├── index.html               ← Login page (app entry point)
  │
  ├── pages/                   ← One file per screen/feature
  │   ├── auth/
  │   │   └── register.html    ← New user registration
  │   ├── dashboard.html       ← Overview: stats, charts, heatmap
  │   ├── products.html        ← Add/edit/delete products (CRUD)
  │   ├── inventory.html       ← Stock levels, restock modal
  │   ├── order.html           ← POS screen — cart + checkout
  │   ├── history.html         ← Past sales with filters + receipt
  │   ├── analytics.html       ← Charts, KPIs, activity heatmap
  │   ├── finance.html        ← Cashflow log: capital, expenses,
  │   │                           withdrawals, derived utang balance
  │   ├── ai.html              ← AI assistant chat interface
  │   ├── sales.html           ← Sales reports page (placeholder)
  │   └── account.html         ← User profile + app settings
  │
  ├── css/
  │   ├── main.css             ← Variables, reset, typography,
  │   │                           animations, login/register styles
  │   ├── layout.css           ← App shell: sidebar, topbar, page body
  │   ├── components.css       ← Shared components: tables, badges,
  │   │                           buttons, inputs, modals, receipt
  │   ├── onboarding.css       ← Onboarding visuals (welcome modal,
  │   │                           checklist, spotlight tour, empty states)
  │   ├── os.widget.css        ← Os AI docked chat panel (overlay on
  │   │                           desktop, bottom sheet on mobile)
  │   └── pages/               ← Page-specific styles (one per page)
  │       ├── dashboard.css
  │       ├── products.css
  │       ├── inventory.css
  │       ├── order.css
  │       ├── history.css
  │       ├── analytics.css
  │       ├── finance.css
  │       ├── ai.css
  │       └── account.css
  │
  ├── js/
  │   │
  │   ├── core/                ← App-wide infrastructure
  │   │   ├── auth.js          ← Login, register, checkAuth guard
  │   │   ├── theme.js         ← Dark/light mode toggle
  │   │   ├── data.js          ← Shared utilities (formatPeso),
  │   │   │                       stock colors, localStorage seeding
  │   │   ├── api.js           ← Centralized HTTP client (JWT auth,
  │   │   │                       401 handling, auto-redirect to login)
  │   │   └── utils.js         ← Loading states, toast notifications,
  │   │                           shared UX helpers
  │   │
  │   ├── components/          ← Reusable UI pieces (not page-specific)
  │   │   ├── sidebar.js       ← Active nav link, user initials, nav prefs
  │   │   ├── receipt.js       ← Shared receipt modal logic
  │   │   ├── os.client.js     ← Pure chat client (no DOM): SSE streaming,
  │   │   │                       sessionStorage history, AbortController
  │   │   ├── os.widget.js     ← Docked Os chat panel (Messenger-style):
  │   │   │                       desktop bottom-right overlay + mobile
  │   │   │                       full-screen bottom sheet, lazy-mount DOM
  │   │   └── os.js            ← Os FAB bootstrapper: mounts the floating
  │   │                           button on every page, toggles OsWidget
  │   │
  │   └── pages/               ← One script per page
  │       ├── dashboard.js     ← Summary stats, charts, heatmap
  │       ├── products.js      ← Product CRUD, modal, search
  │       ├── inventory.js     ← Stock table, filters, restock
  │       ├── order.js         ← POS cart, category pills, checkout
  │       ├── history.js       ← Sales filter, detail modal
  │       ├── analytics.js     ← KPI cards, Chart.js charts, date range
  │       ├── finance.js      ← Cashflow entry, list, summary tiles
  │       │                       (Money In / Out / Net / Utang)
  │       ├── ai.js            ← Chat interface, question submission
  │       ├── sales.js         ← Sales reports page (auth guard only)
  │       └── account.js       ← Account dropdown, settings, custom tax rate input
  │
  └── assets/
      ├── images/              ← Logos, product placeholder images
      ├── icons/               ← UI icons (SVG or PNG)
      ├── fonts/               ← Self-hosted DM Sans (woff2, latin + latin-ext
                                  variable subsets) loaded via @font-face in
                                  main.css — no Google Fonts CDN
      └── vendor/              ← Self-hosted third-party libs (lucide icons +
                                  Chart.js — no CDN, so they load offline / under
                                  strict tracking-prevention)

  ─────────────────────────────────────────────────────────────

  CSS LOADING PATTERN (all app pages):
  ─────────────────────────────────────────────────────────────

    <link rel="stylesheet" href="../css/main.css">
    <link rel="stylesheet" href="../css/layout.css">
    <link rel="stylesheet" href="../css/components.css">
    <link rel="stylesheet" href="../css/pages/[page].css">

  Login (index.html) and Register (pages/auth/register.html) only
  need main.css — no sidebar or layout styles.

  ─────────────────────────────────────────────────────────────

  JS LOADING ORDER (all app pages):
  ─────────────────────────────────────────────────────────────

    components/sidebar.js → core/theme.js → core/auth.js →
    core/data.js → [components/receipt.js if needed] → pages/[page].js

  Core and component scripts always load before page scripts so
  that functions like formatPeso and checkAuth are available
  globally.

  ─────────────────────────────────────────────────────────────

  backend/                     ← Phase 2 + 3 (COMPLETE)
  │
  ├── server.js                ← App entry point. Env validation,
  │                               middleware stack, graceful shutdown.
  ├── .env                     ← DB credentials, JWT secret, port (git-ignored)
  │
  ├── config/
  │   └── db.config.js         ← MySQL connection pool (mysql2/promise)
  │
  ├── routes/                  ← URL endpoints (API paths)
  │   ├── auth.routes.js       ← /api/auth/login, /api/auth/register,
  │   │                           /api/auth/me
  │   ├── products.routes.js   ← /api/products (CRUD)
  │   ├── sales.routes.js      ← /api/sales (create, history, summary,
  │   │                           by ID)
  │   ├── inventory.routes.js  ← /api/inventory (stock, low-stock,
  │   │                           summary, adjust — admin-protected)
  │   ├── analytics.routes.js  ← /api/analytics (summary, heatmap,
  │   │                           kpis, charts — JWT-protected)
  │   ├── finance.routes.js    ← /api/finance (list, summary, CRUD
  │   │                           — JWT-protected, admin delete)
  │   └── ai.routes.js         ← /api/ai/chat, /chat/stream, /summary,
  │                               /restock, /forecast, /profit (Phase 4 COMPLETE)
  │
  ├── controllers/             ← Business logic for each feature
  │   ├── auth.controller.js
  │   ├── products.controller.js
  │   ├── sales.controller.js
  │   ├── inventory.controller.js
  │   ├── analytics.controller.js
  │   ├── finance.controller.js
  │   ├── ai.controller.js     ← Phase 4 COMPLETE (6 endpoints: chat,
  │   │                           stream, summary, restock, forecast, profit)
  │   ├── settings.controller.js  ← store timezone + store name/address
  │   ├── team.controller.js   ← cashier sub-accounts + daily-sales audit (6.5)
  │   ├── billing.controller.js   ← billing state + GCash claim, verify-first (6.6)
  │   └── admin.controller.js     ← super-admin: claim approve/reject + QR upload (6.6)
  │
  ├── models/                  ← MySQL query functions (no in-memory state)
  │   ├── user.model.js        ← Users table: findByEmail, findById,
  │   │                           create (bcrypt hashing)
  │   ├── product.model.js     ← Products table: CRUD, soft-delete,
  │   │                           search/filter, stock management
  │   ├── sale.model.js        ← Sales + analytics: atomic create(),
  │   │                           getHistory(), getById(), summary,
  │   │                           heatmap, kpis, charts aggregations
  │   ├── cashflow.model.js    ← cash_movements CRUD, monthly summary
  │   │                           (in/out/net), utang balance derivation
  │   ├── store.model.js       ← stores (tenant) row: findById, updateBilling
  │   │                           (plan/paid_until), name/address/timezone (6.5)
  │   ├── claim.model.js       ← payment_claims ledger: create/list/find (6.6)
  │   ├── platformConfig.model.js ← global GCash QR + receiving name/number (6.6)
  │   └── settings.model.js    ← legacy app_settings timezone fallback (boot only)
  │
  ├── middleware/
  │   ├── auth.middleware.js   ← JWT verification + admin role check
  │   ├── tenant.middleware.js ← loadStore (req.store/req.plan) +
  │   │                           requireFeature (402 plan gate)  [Phase 6.5]
  │   └── error.middleware.js  ← Global error handler
  │                               ({ success: false, message })
  │
  │  Phase 6.5 multi-tenant SaaS also adds: config/plans.js (entitlements),
  │  models/store.model.js, controllers+routes for team.* and billing.*,
  │  test-tenancy.js, and migrate_multitenant.sql. Frontend adds pages/team.html
  │  + pages/billing.html (+ their js) and entitlement gating in core/api.js,
  │  core/auth.js, and components/sidebar.js. See Section 10, Phase 6.5.
  │
  │  Phase 6.6 billing bridge adds: admin.controller/routes (super-admin),
  │  claim.model + platformConfig.model, platform.middleware (requireSuperAdmin),
  │  migrate_billing_bridge.sql (paid_until, payment_claims, platform_config,
  │  users superadmin), scripts/create-superadmin.js. Frontend adds
  │  components/billing.modal.js (shared GCash Upgrade modal), pages/admin.html
  │  (operator dashboard), show-locked nav (sidebar.js), and the dashboard
  │  reminder/upgrade cards. See celsopos_P6-6.txt + Section 10, Phase 6.6.
  │
  └── tests/
      ├── test-checkpoint37.js ← Security + integration tests (37 checks)
      └── test-integration.js  ← Full end-to-end flow tests (56+ checks)

  ─────────────────────────────────────────────────────────────

  database/                    ← Phase 3 (COMPLETE)
  │
  ├── schema.sql               ← 6-table relational schema with indexes
  │                               and foreign keys (cash_movements
  │                               added in Phase 5)
  ├── seed.sql                 ← Sample products, users, and sales data
  └── migrate_*.sql            ← One-off migrations for existing databases
                                  (run as a privileged user; see Section 9)

  ─────────────────────────────────────────────────────────────

  scripts/
  │
  └── bust-cache.js            ← Stamps ?v=<version> on local frontend assets
                                  so deploys serve fresh CSS/JS (no build step)

  ─────────────────────────────────────────────────────────────

  ai/                          ← Phase 4 (COMPLETE)
  │
  ├── assistant.js             ← Orchestrator: provider routing + MD5 response cache
  ├── context-builder.js       ← Aggregates DB data (sales, inventory, cashflow),
  │                               builds plain-text context block for LLM
  ├── providers/
  │   ├── groq.js              ← Primary: Groq Llama 3.3 70B (free tier)
  │   └── deepseek.js          ← Fallback: DeepSeek V3 (activated on Groq 429/503)
  └── prompts/
      └── system.js            ← System prompt: Filipino MSME framing, Taglish support,
                                   cashflow vocabulary (puhunan, utang, kuha)

  ─────────────────────────────────────────────────────────────

================================================================
[4. DATABASE SCHEMA]
================================================================

  ENGINE: MySQL 8.0 | CHARSET: utf8mb4
  DRIVER: mysql2/promise (connection pool, size: 5)

  TIME CONVENTION:
    All DATETIME columns store UTC. The DB pool sets every connection's session
    time zone to UTC (SET time_zone='+00:00') and mysql2 parses/serialises
    datetimes as UTC ('Z'), so CURRENT_TIMESTAMP is true UTC regardless of the
    host's system zone. Day-bucketing and display happen in the PER-STORE
    timezone (stores.timezone) via CONVERT_TZ in the aggregation queries.
    When MySQL's named-timezone tables aren't loaded (e.g. PlanetScale),
    the backend falls back to a fixed numeric offset computed in Node.
    Exception: cash_movements.occurred_at is a user-picked calendar DATE
    (no time component) and is never timezone-converted.

  MULTI-TENANCY (Phase 6.5): every owned table below carries a
  store_id INT NOT NULL FK → stores(id), and EVERY query is scoped to the
  caller's store. sale_items is the only exception — it is scoped transitively
  through its parent sale. Receipt numbers stay globally unique.

  TABLE: stores  (one row per tenant — Phase 6.5)
  ─────────────────────────────────────────────────────────────
    id                  INT     PK, AUTO_INCREMENT
    name, address       VARCHAR per-store identity (printed on receipts)
    timezone            VARCHAR IANA store timezone (per-store now)
    currency            VARCHAR default 'PHP'
    plan                ENUM    'free' | 'basic' | 'plus' | 'pro'
    subscription_status ENUM    'none'|'trialing'|'active'|'past_due'|'canceled'
    trial_ends_at       DATETIME no-card Basic trial expiry (14 days on signup)
    paid_until          DATETIME end of the current paid period (6.6); entitled
                                 while now <= paid_until + 3-day grace
    ls_customer_id      VARCHAR legacy (Lemon Squeezy, retired) — unused
    ls_subscription_id  VARCHAR legacy (Lemon Squeezy, retired) — unused
    owner_user_id       INT     the store's owner-admin (no FK — avoids a cycle)
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP

  ─────────────────────────────────────────────────────────────
  TABLE: payment_claims  (manual GCash billing ledger — Phase 6.6)
  ─────────────────────────────────────────────────────────────
    id, store_id (FK)   the claiming store
    plan                ENUM    'basic' | 'plus' | 'pro'
    amount_php          INT     price snapshot at submit time
    gcash_ref           VARCHAR UNIQUE — a reference can be claimed once, ever
    status              ENUM    'pending' | 'approved' | 'rejected'
    submitted_by/at, reviewed_by/at, review_note, period_start, period_end

  ─────────────────────────────────────────────────────────────
  TABLE: platform_config  (single global row id=1 — Phase 6.6)
  ─────────────────────────────────────────────────────────────
    gcash_qr_path       VARCHAR served path to the receiving GCash QR image
    gcash_name, gcash_number   receiving account shown in the Upgrade modal

  Also (6.6): users.store_id is now NULLABLE and users.role gains 'superadmin'
  for the single platform operator (no tenant store); app enforces NOT NULL for
  tenant users.

  TABLE: app_settings  (single row — legacy global config)
  ─────────────────────────────────────────────────────────────
    Retained as a boot-time fallback only. Per-store timezone/name/address now
    live on stores; reads come from req.store via loadStore.
    id          TINYINT       PK, always 1
    timezone    VARCHAR(64)   IANA default (default: Asia/Manila)

  TABLE: users
  ─────────────────────────────────────────────────────────────
    id          INT           PK, AUTO_INCREMENT
    store_id    INT           FK → stores.id, NOT NULL (which store they belong to)
    full_name   VARCHAR       NOT NULL
    email       VARCHAR       GLOBALLY UNIQUE, NOT NULL (login is global)
    password    VARCHAR       bcrypt hash, NOT NULL
    role        VARCHAR       'admin' (store owner, created at signup) | 'cashier'
                              (sub-account created on the Team page)
    is_active   TINYINT(1)    0 = suspended (can't log in); 1 = active
    must_change_password TINYINT(1)  reserved (unused — passwords are admin-managed)
    session_id  VARCHAR(64)   id of the most recent login (single active session)
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    updated_at  TIMESTAMP     AUTO UPDATE

  TABLE: products
  ─────────────────────────────────────────────────────────────
    id          INT           PK, AUTO_INCREMENT
    name        VARCHAR(150)  NOT NULL
    category    VARCHAR(100)  NOT NULL
    price       DECIMAL(10,2) NOT NULL, > 0
    cost        DECIMAL(10,2) >= 0
    stock       INT           >= 0, default 0
    unit        VARCHAR       piece | pack | bottle | can |
                              sachet | box | kg | liter
    is_active   TINYINT(1)    Soft-delete flag (default: 1)
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    updated_at  TIMESTAMP     AUTO UPDATE

  TABLE: sales
  ─────────────────────────────────────────────────────────────
    id          INT           PK, AUTO_INCREMENT
    receipt_no  VARCHAR       UNIQUE, format: RCPT-XXXXXX
    subtotal    DECIMAL(10,2)
    tax         DECIMAL(10,2)
    tax_rate    DECIMAL(5,4)   stored as a fraction (e.g. 0.1200 = 12%)
    cart_tax_on TINYINT(1)    0 = tax not applied to this sale | 1 = tax applied
    total       DECIMAL(10,2)
    payment     DECIMAL(10,2)
    change_given DECIMAL(10,2)
    cashier_id  INT           FK → users.id
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP

  TABLE: sale_items
  ─────────────────────────────────────────────────────────────
    id           INT          PK, AUTO_INCREMENT
    sale_id      INT          FK → sales.id, NOT NULL
    product_id   INT          FK → products.id, NOT NULL
    product_name VARCHAR      Snapshot of name at time of sale
    unit_price   DECIMAL(10,2) Snapshot of price at time of sale
    quantity     INT          > 0
    line_total   DECIMAL(10,2) unit_price × quantity

  TABLE: inventory_adjustments  (audit log)
  ─────────────────────────────────────────────────────────────
    id           INT          PK, AUTO_INCREMENT
    product_id   INT          FK → products.id, NOT NULL
    type         VARCHAR      restock | adjustment | damage |
                              return | sale
    qty          INT          Absolute quantity changed
    stock_before INT          Snapshot before change
    stock_after  INT          Snapshot after change
    notes        TEXT         Optional description or receipt_no
    adjusted_by  INT          FK → users.id (nullable)
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP

  TABLE: cash_movements               (Phase 5 — Cashflow log)
  ─────────────────────────────────────────────────────────────
    id           INT           PK, AUTO_INCREMENT
    type         ENUM          'capital_in' | 'owner_draw' | 'opex' | 'capex' |
                               'sales_revenue'  (auto-created by POS on checkout)
    category     VARCHAR       Subcategory — meaning depends on type:
                                 capital_in:  'own' | 'borrowed'
                                 owner_draw:  'personal' | 'debt_payment' |
                                              'restock' | 'opex' | 'other'
                                 opex/capex:  rent | utilities | transport |
                                              supplies | equipment |
                                              furniture | restock | other
                                              (free-form allowed)
    amount       DECIMAL(10,2) Always positive; direction implied by type.
                               For borrowed capital this is the principal (the
                               cash actually received), NOT the total repayable.
    monthly_due  DECIMAL(10,2) Borrowed-loan repayment terms (NULL otherwise).
    term_months  INT           monthly_due × term_months = full amount to repay
                               (interest baked in) — this drives the Debt
                               Balance. NULL on legacy/informal loans, which
                               fall back to `amount` for the debt calc.
    description  TEXT          Notes — lender name on borrowed capital,
                               purpose on owner_draw, free-form otherwise
    occurred_at  DATE          When the movement actually happened
    source       VARCHAR       'manual' | 'restock' (auto-created entries)
    source_id    INT           FK to inventory_adjustments.id (nullable)
    recorded_by  INT           FK → users.id
    is_active    TINYINT(1)    Soft-delete flag (default: 1)
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP

  DERIVED VIEWS (computed, not stored):
    Money In   = SUM(amount WHERE type IN ('capital_in','sales_revenue'))
                 -- Sales are recorded once in cash_movements (type=sales_revenue)
                 -- by the POS create-sale transaction; never re-summed from sales.total.
    Money Out  = SUM(amount WHERE type IN ('owner_draw','opex','capex'))
    Net        = Money In − Money Out
    Utang      = MAX(0, total loan obligation − total debt payments), where
                   obligation per borrowed loan = COALESCE(monthly_due ×
                     term_months, amount)   -- terms incl. interest, else principal
                   payments = SUM(amount WHERE type='owner_draw'
                                  AND category='debt_payment')

  SCHEMA ALTERATIONS (Phase 5):
  ─────────────────────────────────────────────────────────────
    inventory_adjustments:
      + unit_cost       DECIMAL(10,2) NULL   cost per unit at restock time
      + total_paid      DECIMAL(10,2) NULL   total paid to supplier
      + payment_method  ENUM('cash','bank','credit') NULL
      + supplier_name   VARCHAR(100) NULL
    These columns and the auto-created restock opex row are BACKEND-READY
    but NOT surfaced in the current MVP UI: when total_paid > 0 is supplied,
    a cash_movements row is created (type='opex', category='restock',
    source='restock', source_id=inventory_adjustments.id). The MVP restock
    modal is quantity-only and never sends cost fields, so this path is
    reserved for a future dedicated inventory module — money spent on stock
    is recorded manually on the Finance page instead.

    products:
      Product creation now enforces initial stock = 0. All stock entry
      flows through the inventory restock modal — this separates concerns
      (Products defines the item and its cost; Inventory adds quantity).

    cash_movements:
      + monthly_due   DECIMAL(10,2) NULL   borrowed-loan monthly repayment
      + term_months   INT           NULL   borrowed-loan number of months
    Already covered by schema.sql for fresh installs. For an existing DB:
      ALTER TABLE cash_movements
        ADD COLUMN monthly_due DECIMAL(10,2) NULL,
        ADD COLUMN term_months INT NULL;

  INDEXES: users.email (UNIQUE), products.name, products.category,
           sales.created_at, sales.cashier_id, sale_items.sale_id,
           sale_items.product_id, inventory_adjustments.product_id,
           inventory_adjustments.created_at,
           cash_movements.type, cash_movements.category,
           cash_movements.occurred_at, cash_movements.source_id

================================================================
[5. API REFERENCE]
================================================================

  BASE URL   : http://localhost:3000/api
  AUTH HEADER: Authorization: Bearer <token>
  FORMAT     : All responses → { success: boolean, data | message }

  MULTI-TENANCY + ENTITLEMENTS (Phase 6.5): protected routes run
  auth → loadStore (attaches req.store/req.plan), and feature routes add
  requireFeature(...). Plan gate failures return 402 { code:
  'UPGRADE_REQUIRED' }; role failures (non-admin) return 403. Feature map:
    finance/* → 'finance' (Basic) · ai/* → 'ai' (Plus)
    analytics {kpis,charts,heatmap,profit} → 'analytics' (Basic)
    analytics {projection,inventory-health} → 'advanced_analytics' (Plus)
    analytics/summary, products/*, inventory/*, sales/* → no plan gate
      (reachable by cashiers; the POS + History need the reads)
  login + GET /me also return { plan, features, role, cashierSeats, state,
  paidUntil, graceEndsAt, trialEndsAt } for the client to mirror the gating
  (UI only — the server is the boundary).

  ──────────────────────────────────────────────────────────────
  AUTHENTICATION  /api/auth
  ──────────────────────────────────────────────────────────────

    POST   /register       Public (rate-limited)
      Body: { fullName, email, password }   (password ≥ 8 chars)
      → 201 { success, message }
      → 400 validation error | 409 email already exists

    POST   /login          Public (rate-limited)
      Body: { email, password }
      → 200 { success, token, user: { id, fullName, email, role } }
      → 401 invalid credentials

    GET    /me             Auth required
      → 200 { success, user: { id, fullName, email, role }, timezone,
              storeName, storeAddress,
              plan, features, role, cashierSeats, state, paidUntil,
              graceEndsAt, trialEndsAt }

    PUT    /password       Auth + Admin required
      Body: { newPassword, currentPassword? }
      Owner self-service password change. Admin-only — cashiers don't manage
      their own credentials (the owner resets them on the Team page).
      → 200 { success } | 400 too short | 403 not admin

    Note: register now creates a NEW isolated store + its owner-admin (14-day
    Basic trial), replacing the single-tenant first-account-admin rule.

  ──────────────────────────────────────────────────────────────
  PRODUCTS  /api/products
  ──────────────────────────────────────────────────────────────

    GET    /               Public
      Query: ?search=<string>&category=<string>
      → 200 { success, data: Product[] }
      Returns only active products, sorted A→Z

    GET    /archived       Auth required
      Query: ?search=<string>
      → 200 { success, data: Product[], hasMore }
      Soft-deleted products (is_active = 0), newest-archived first.
      Backs the Products page "Archived" view so deleted items stay
      recoverable instead of being silently re-created as duplicates.
      Capped at 50 rows (archived items grow unbounded over time);
      hasMore = true means older items exist beyond the cap — narrow
      with ?search. Search matches the product name (case-insensitive).

    GET    /:id            Public
      → 200 { success, data: Product }
      → 404 not found

    POST   /               Auth required
      Body: { name, category, price, cost, unit, allowDuplicate? }
      Initial stock is always 0 — stock is added exclusively via the
      restock endpoint (POST /api/inventory/:productId/adjust). Product
      cost is captured here on the product record (the source for
      COGS/profit); quantity is added later on the Inventory page.
      Archived-twin guard: if an archived product with the same name
      exists, creation is blocked so the client can offer Restore (keeps
      sale history on the original id) vs. Add new — a duplicate would
      split that product's history across two ids and drop the old half
      from profit-by-product (which filters is_active = 1). Pass
      allowDuplicate: true to override and create a separate item.
      → 201 { success, data: Product }
      → 400 validation error
      → 409 { success: false, archivedMatch: true, data: Product }
            (archived twin found; not created)

    POST   /:id/restore    Auth required
      Body: { name, category, price, cost, unit }  (optional)
      Un-archives a soft-deleted product (is_active → 1), preserving its
      id and all linked sale history. With a body, also refreshes the
      product's details/pricing to the supplied values (used by the
      re-add "Restore" choice); without one, restores it exactly as
      archived (used by the Archived list). Stock is left untouched.
      → 200 { success, data: Product }
      → 404 archived product not found

    PUT    /:id            Auth required
      Body: Same as POST (full update)
      → 200 { success, data: Product }

    DELETE /:id            Auth + Admin required
      Soft delete (sets is_active = 0, data is preserved). Recoverable
      via GET /archived + POST /:id/restore.
      → 204 no content

  ──────────────────────────────────────────────────────────────
  SALES  /api/sales
  ──────────────────────────────────────────────────────────────

    POST   /               Auth required
      Body: { items: [{ productId, name, price, quantity,
              lineTotal }], subtotal, tax, taxRate, cartTaxOn,
              total, payment }
      Server recalculates all prices from DB — client values
      are verified, not trusted.
      Atomically: inserts sale, inserts items, deducts stock,
      logs inventory_adjustments — all in one transaction.
      → 201 { success, data: Sale }
      → 400 insufficient stock | price mismatch | validation

    GET    /               Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
      → 200 { success, data: Sale[] }

    GET    /:id            Auth required
      → 200 { success, data: Sale }

    GET    /summary        Auth required
      → 200 { success, data: { totalRevenue, transactionCount,
              avgSaleValue } } (today only)

    PUT    /:id            Auth + Admin required
      Body: { items: [{ itemId, quantity }], cartTaxOn, payment }
      Edits a past sale. Each itemId references an existing sale_items
      row; quantity 0 removes that line (at least one line must remain).
      Lines not sent keep their original quantity. Server trusts only the
      new quantities, the tax toggle, and the payment — unit prices come
      from the original sale_items snapshot and the sale's stored tax_rate
      (never re-read from the live product price). Atomically, in one
      locked transaction:
      returns/deducts the stock delta per line, writes balancing
      inventory_adjustments rows, recomputes subtotal/tax/total/change,
      and re-amounts the linked sales_revenue cash movement — so
      Inventory, Finance, and Analytics all stay reconciled.
      → 200 { success, data: Sale }
      → 400 insufficient stock | validation | 404 not found

  ──────────────────────────────────────────────────────────────
  INVENTORY  /api/inventory
  ──────────────────────────────────────────────────────────────

    GET    /               Auth required
      → 200 { success, data: [{ id, name, category, stock, unit,
              status: out-of-stock | low | in-stock }] }

    GET    /low-stock      Auth required
      Query: ?threshold=<int> (default: 50)
      → 200 { success, threshold, count, data: Product[] }

    GET    /summary        Auth required
      → 200 { success, data: { totalProducts, lowStockCount,
              outOfStockCount, lowStockItems } }

    POST   /:productId/adjust   Auth + Admin required
      Body: { quantity, type, notes?,
              recordExpense?, unitCost?, totalPaid?,
              paymentMethod?, supplierName? }
      type: restock | adjustment | damage | return
      restock/return → adds stock | damage/adjustment → removes
      Stock never goes below 0.

      Phase 5 cost capture (restock only) — BACKEND-READY, NOT USED BY THE
      CURRENT MVP UI (reserved for a future dedicated inventory module):
        If recordExpense === true (when totalPaid > 0), the
        inventory_adjustment is persisted with unit_cost, total_paid,
        payment_method, supplier_name — and a cash_movements row is
        atomically created (type='opex', category='restock',
        source='restock', source_id=adjustment.id).
        The MVP restock modal is quantity-only and omits these fields, so
        stock is added without an expense entry; money spent on stock is
        recorded manually on the Finance page.

      → 200 { success, data: { product, adjustment, cashMovement? } }

  ──────────────────────────────────────────────────────────────
  ANALYTICS  /api/analytics
  ──────────────────────────────────────────────────────────────

    GET    /summary        Auth required
      Query: ?date=YYYY-MM-DD (default: today)
      → 200 { success, data: { todayRevenue, todayTransactions,
              avgSaleValue, totalProducts, lowStockCount,
              outOfStockCount, lowStockItems } }

    GET    /heatmap        Auth required
      → 200 { success, data: { "YYYY-MM-DD": totalRevenue, ... } }
      All dates with sales activity, mapped to their revenue.

    GET    /kpis           Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days)
      → 200 { success, data: { totalRevenue, transactionCount,
              avgOrderValue, totalUnits,
              previous: { totalRevenue, transactionCount,
                          avgOrderValue, totalUnits },
              previousRange: { from, to } } }
      `previous` is the immediately-prior same-length window — used
      by the analytics page to render period-over-period deltas.

    GET    /charts         Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days)
      → 200 { success, data: { revenueByDay, topByRevenue,
              topByQty, byDayOfWeek } }
      revenueByDay: all dates in range, 0-filled for missing days
      topByRevenue / topByQty: top 5 products each
      byDayOfWeek: array[7] (Sun=0 … Sat=6)

    GET    /profit         Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days)
      → 200 { success, data: { revenue, cogs, grossProfit, margin,
              byProduct: [{ name, revenue, cogs, profit, units,
                            margin }],
              previous: { revenue, cogs, grossProfit, margin },
              previousRange: { from, to } } }
      Realized gross profit:
        grossProfit = SUM(line_total) − SUM(quantity × products.cost)
      `margin` is a percentage. `byProduct` is the top 10 products
      ranked by profit in the window. Compared against the
      immediately-prior same-length window.

    GET    /inventory-health   Auth required
      Looks back 90 days. Buckets products by movement velocity.
      Each item carries { id, name, stock, unit, category, price,
      cost, unitsSold, dailyRate, weeklyRate, daysOfStock,
      tiedUpCapital }.
      → 200 { success, data: {
                windowDays,
                deadStock:  Item[],   // ≤ 20, no movement, in-stock
                slowMovers: Item[],   // ≤ 20, ≤ 1 unit/week, in-stock
                turnover:   Item[],   // ≤ 20, sorted by daysOfStock desc
                fastMovers: Item[]    // ≤ 10, ≥ 5 units/week
              } }
      daysOfStock is null when there's no movement.

    GET    /projection         Auth required
      One-stop endpoint for the Monthly Revenue Goal card.
      Computes a server-side end-of-month projection using:
        MTD revenue (1st of month → today)
        + trailing-30-day daily average × days remaining in month
      Frontend is flagged when history < 14 days (limitedData: true)
      so it can caveat the estimate instead of presenting a confident
      number.
      → 200 { success, data: {
                currentMonth: { from, to, revenue },
                trailingDailyAvg, daysOfHistory,
                daysRemaining, daysInMonth,
                projection,
                limitedData   // true when history < 14 days
              } }

  ──────────────────────────────────────────────────────────────
  AI ASSISTANT  /api/ai          (Phase 4 COMPLETE)
  ──────────────────────────────────────────────────────────────

    All endpoints: Auth required (20 req/15 min per user)
    Backend assembles full context (inventory snapshot, 30-day
    sales, cashflow summary) before every call — frontend sends
    only the user's message, never raw data.

    POST   /chat           Non-streaming; MD5-cached per (question + date)
      Body: { message, history? }
      → 200 { success, data: { answer, cached, tokensUsed } }
      → 429 rate limit exceeded

    POST   /chat/stream    SSE streaming (used by ai.html chat UI)
      Body: { message, history? }
      Streams: data: { text } chunks → data: { done, history } → end
      → 200 text/event-stream
      → 429 rate limit exceeded

    GET    /summary        Daily business brief (cached)
      → 200 { success, data: { summary, urgency: low|medium|high,
              tip, cached } }

    GET    /restock        AI-ranked restock list (cached)
      → 200 { success, data: { items: [{ name, stock, priority:
              urgent|soon|monitor, reason }], cached } }

    GET    /forecast       Tomorrow's revenue forecast by day-of-week (cached)
      → 200 { success, data: { day, expectedRevenue, confidence:
              low|medium|high, note, cached } }

    GET    /profit         Margin analysis + profitability insights (cached)
      → 200 { success, data: { insights: [{ product, finding,
              action }], summary, cached } }

  ──────────────────────────────────────────────────────────────
  FINANCE  /api/finance          (Phase 5)
  ──────────────────────────────────────────────────────────────

    GET    /               Auth required
      Query: ?type=<enum>&category=<string>
             &from=YYYY-MM-DD&to=YYYY-MM-DD
      type: capital_in | owner_draw | opex | capex | sales_revenue
      → 200 { success, data: CashMovement[] }
      Active rows only, sorted newest first.

    GET    /summary        Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: all-time)
      → 200 { success, data: {
                moneyIn, moneyOut, net, debtBalance,
                byType: { capital_in, owner_draw, opex, capex, sales_revenue },
                byCategory: { <category>: <total>, ... }
              } }
      debtBalance = MAX(0, total loan obligation − total debt payments), where a
        borrowed loan's obligation = COALESCE(monthly_due × term_months, amount)
        (the full repayable amount with interest, else the principal) and
        payments = SUM(owner_draw WHERE category='debt_payment')
      (period-independent — reflects current outstanding balance; floored at 0)

    GET    /profit         Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: current calendar month
              in the store-local timezone)
      → 200 { success, data: {
                revenue, cogs, grossProfit,
                opex,           -- non-restock opex + owner_draw with category='opex'
                capex,
                profit,         -- grossProfit − opex − capex
                margin,         -- profit / revenue × 100, 2dp
                previous: { profit, revenue, range: { from, to } },
                period:   { from, to }
              } }
      Restock opex is intentionally excluded from `opex` here because its
      cost is already realized as COGS the moment each item is sold.
      Including it would double-charge the owner against the same purchase.

    POST   /               Auth required
      Body: { type, category, amount, description?, occurred_at,
              monthly_due?, term_months? }
      type: 'capital_in' | 'owner_draw' | 'opex' | 'capex'
      category: validated against type-specific allowed values
      occurred_at: YYYY-MM-DD format (validated server-side)
      monthly_due / term_months: optional, only for capital_in + borrowed
        (both-or-neither; term_months is a whole number 1–120). Forced to NULL
        for every other entry. Their product is the loan's debt obligation.
      → 201 { success, data: CashMovement }
      → 400 validation error

    PUT    /:id            Auth required
      Body: Same as POST (full update)
      → 200 { success, data: CashMovement }
      Auto-created entries (source ≠ 'manual') are read-only.

    DELETE /:id            Auth + Admin required
      Soft delete (sets is_active = 0).
      → 204 no content

  ──────────────────────────────────────────────────────────────
  SETTINGS  /api/settings          (store-wide)
  ──────────────────────────────────────────────────────────────

    GET    /               Auth required
      → 200 { success, data: { timezone, storeName, storeAddress } }
      All three live on the store row and are shared by every user of the
      store (owner + cashiers).

    PUT    /timezone       Auth + Admin required
      Body: { timezone }   IANA zone, validated server-side
      → 200 { success, data: { timezone } }
      → 400 invalid timezone
      Changing the timezone never rewrites past records (timestamps are
      absolute UTC moments) — it only changes how days are bucketed and
      displayed going forward.

    PUT    /store-info     Auth + Admin required
      Body: { storeName, storeAddress }   (name ≤ 60, address ≤ 120 chars)
      → 200 { success, data: { storeName, storeAddress } }
      → 400 too long
      Stored on the store row (NOT per-user preferences), so a cashier's
      receipts carry the same identity as the owner's. Printed on receipts
      and drives the sidebar brand. login + GET /me also return storeName/
      storeAddress so the client renders them without an extra call.

    Note: POST /api/auth/login and GET /api/auth/me now also return the
    current store `timezone` so the frontend can render dates in store
    time without an extra call.

  ──────────────────────────────────────────────────────────────
  TEAM  /api/team          (Phase 6.5 — admin only)
  ──────────────────────────────────────────────────────────────

    All routes: Auth + loadStore + Admin. Scoped to this store's cashiers;
    cashiers get 403.

    GET    /               List cashiers + seat usage
      → 200 { success, data: Cashier[], seatsUsed, seatsTotal }

    GET    /daily-sales            Per-person sales breakdown for one
      Query: { date? }            store-local day (owner + cashiers), for
                                   shift reconciliation. Defaults to today
                                   in the store timezone.
      → 200 { success, data: { date, store: { total, transactions,
              avgSale }, people: [{ userId, name, role, transactions,
              total, avgSale, firstAt, lastAt }] } }

    GET    /daily-sales/:userId    Receipts one person rang up that day
      Query: { date? }            (drill-down for the audit modal).
      → 200 { success, data: [{ id, receiptNo, total, itemCount,
              timestamp }] }

    POST   /               Create a cashier (owner sets the password)
      Body: { fullName, email, password }
      Enforces the plan seat limit (Free 0 / Basic 0 / Plus 1 / Pro 2) and
      global email uniqueness.
      → 201 { success, data } | 402 SEAT_LIMIT | 409 email exists

    PATCH  /:id/active     Activate / deactivate (suspend)
      Body: { active }   Reactivation respects the seat limit.
      → 200 { success } | 402 SEAT_LIMIT | 404

    PUT    /:id/password   Owner resets a cashier's password
      Body: { password }
      → 200 { success } | 400 too short | 404

    DELETE /:id            Permanently delete a cashier (hard delete)
      Blocked (409 HAS_HISTORY) if the cashier has sales recorded under
      their id — deactivate instead.
      → 204 | 409 HAS_HISTORY | 404

  ──────────────────────────────────────────────────────────────
  BILLING  /api/billing    (Phase 6.6 — manual GCash bridge)
  ──────────────────────────────────────────────────────────────

    Both routes: Auth + loadStore + Admin (owner-only). No payment provider —
    the owner pays a GCash QR and submits the reference number; a super-admin
    approves it (verify-first). Plan + grace resolve from the store row per
    request (config/plans.resolveBilling). Lemon Squeezy is retired.

    GET    /state          Plan, billing state, seats, prices, pending claim,
                           and the global GCash QR (no external call).
      → 200 { success, data: { plan, state, paidUntil, graceEndsAt,
              trialEndsAt, seatsUsed, seatsTotal,
              prices: { basic, plus, pro },
              pendingClaim: {...} | null,
              gcash: { qrUrl, name, number } } }

    POST   /claim          Body: { plan: 'basic'|'plus'|'pro', gcashRef }
      Verify-first: records a `pending` claim; does NOT change the plan.
      → 201 { success, data: { status: 'pending' } }
      → 400 bad plan / ref | 409 a claim is already pending, or the ref was
        already submitted (gcash_ref is globally UNIQUE).  Rate-limited (10/15min).

  ──────────────────────────────────────────────────────────────
  OPERATOR  /api/admin    (Phase 6.6 — platform super-admin only)
  ──────────────────────────────────────────────────────────────

    Every route: Auth + requireSuperAdmin (role 'superadmin'; NO loadStore).
    Non-super-admins get 404 (the surface is invisible). Seed the one operator
    with backend/scripts/create-superadmin.js.

    GET    /claims?status=pending|approved|rejected
      → 200 { success, data: [ claim + store_name + owner_email ] } (pending first)

    POST   /claims/:id/approve
      Transactional + idempotent (FOR UPDATE on a still-pending claim). Sets the
      store's plan + paid_until (anchored to the due date on renewal; preserves
      remaining trial days), then reconciles cashier seats.
      → 200 { success, data: { storeId, plan, paidUntil } } | 409 not pending

    POST   /claims/:id/reject   Body: { note? }
      → 200 { success } (no plan change) | 404 | 409 already reviewed

    GET    /qr   ·   POST /qr   Body: { imageBase64?, name?, number? }
      The QR upload gets its own express.json({1mb}); image validated by MAGIC
      BYTES (PNG/JPEG), ≤500 KB, random filename.
      → 200 { success, data: { qrUrl, name, number } }

  ──────────────────────────────────────────────────────────────
  HEALTH CHECK  /api/health
  ──────────────────────────────────────────────────────────────

    GET    /api/health     Public
      → 200 { success, message, db: "Connected" }
      Connectivity probe only (SELECT 1) — exposes no tenant data.

================================================================
[6. MIDDLEWARE STACK]
================================================================

  Applied in order on every request:

    1. helmet()                  OWASP security headers
                                 (X-Frame-Options, X-Content-Type-Options,
                                  X-XSS-Protection, CSP, etc.)

    2. cors({ origin })          Restricts to FRONTEND_URL env var
                                 (default: http://localhost:5173)
                                 Allowed methods: GET POST PUT DELETE PATCH
                                 Allowed headers: Content-Type Authorization

    3. morgan('dev')             HTTP request logging to stdout
                                 (method, path, status, response time)

    *  POST /api/admin/qr        The QR upload carries a base64 image, so it is
                                 skipped by the global 10 KB JSON parser and gets
                                 its own express.json({1mb}) in admin.routes (6.6).

    4. express.json({ limit })   JSON body parser, capped at 10 KB
                                 (protects against oversized payload DoS)

    5. authLimiter               Rate limit on /api/auth/login and
                                 /api/auth/register: 20 req / 15 min

    6. adjustLimiter             Rate limit on /api/inventory:
                                 60 req / 15 min

    7. authMiddleware            Validates Bearer token; enforces the single
                                 active session (token session_id == DB) and
                                 is_active; attaches req.user (id, role,
                                 storeId, sid). One PK lookup per request.

    8. loadStore + requireFeature  (Phase 6.5, per protected router)
                                 loadStore attaches req.store/req.plan from the
                                 DB; requireFeature gates a route behind a plan
                                 feature (402 UPGRADE_REQUIRED).

    9. adminMiddleware           Checks req.user.role === 'admin';
                                 returns 403 if not (admin-only routes only)

   10. errorMiddleware           Global error handler (last in chain)
                                 → { success: false, message }

================================================================
[7. ENVIRONMENT VARIABLES]
================================================================

  Required — server exits immediately if any are missing:

    JWT_SECRET         Secret key for signing JWTs
                       Must be cryptographically random, ≥ 64 chars
    DB_HOST            MySQL server hostname (e.g. localhost)
    DB_USER            MySQL user (e.g. celsopos_app)
    DB_PASS            MySQL user password
    DB_NAME            Target database name (e.g. celsopos_db)

  Optional — fallback defaults shown:

    PORT               3000     HTTP server port
    DB_PORT            3306     MySQL port
    DB_POOL_SIZE       5        Connection pool size
    FRONTEND_URL       http://localhost:5173   CORS origin
    JWT_EXPIRES_IN     1d       Token lifetime (e.g. 1d, 12h, 30m; any
                                jsonwebtoken-accepted span)

  AI Provider (Phase 4 — required when AI module is enabled):

    GROQ_API_KEY       Groq API key (primary AI provider)
                       Free at console.groq.com — no billing required
    DEEPSEEK_API_KEY   Optional fallback provider. When set, AI requests that hit
                       a Groq 429/503 retry on DeepSeek V3; when absent, the Groq
                       error surfaces. Not required to boot.
    AI_CACHE_TTL_SEC   300      Cache TTL for AI responses in seconds
    AI_MAX_TOKENS      600      Token budget cap per AI request

  Billing (Phase 6.6 — manual GCash bridge): NO payment-provider keys are
  needed. The receiving GCash QR + name/number are configured by the super-admin
  in admin.html (stored in platform_config). The following are OPTIONAL and used
  ONLY by the one-off seed script scripts/create-superadmin.js (not read at
  runtime; can also be passed as CLI args):

    SUPERADMIN_EMAIL             email for the platform operator account
    SUPERADMIN_PASSWORD          its password (≥12 chars)

  Example .env file:

    JWT_SECRET=<128-char random string>
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=celsopos_app
    DB_PASS=your_db_password
    DB_NAME=celsopos_db
    PORT=3000
    FRONTEND_URL=http://localhost:5173
    JWT_EXPIRES_IN=1d
    GROQ_API_KEY=gsk_your_groq_api_key_here

================================================================
[8. SECURITY]
================================================================

  PASSWORD HASHING
    bcrypt with 10 salt rounds. Plaintext passwords are never stored.

  JWT AUTHENTICATION
    Signed with a 128-character cryptographically random JWT_SECRET.
    Token expiry: 1 day (24h), configurable via JWT_EXPIRES_IN. Role
    (admin/cashier), store_id, and the login session id are embedded in the
    payload. Entitlements are NOT in the token — they resolve from the DB per
    request (so a token can't elevate a plan).

  SINGLE ACTIVE SESSION (last-login-wins, Phase 6.5)
    Each login mints a random session_id, stores it on the user row, and signs
    it into the JWT. authMiddleware rejects any request whose token session_id
    != the stored one (or whose account is is_active=0) — so logging in on a
    second device signs the first one out on its next request, and a suspension
    takes effect immediately. One account = one active device.

  SESSION DATA HYGIENE
    Logout and session-end (expired or invalid token) fully clear client-side
    state — token, cached user, preferences, entitlements, and the Os AI
    conversation held in sessionStorage. Store devices are commonly shared, so
    this stops the next user from reading the previous user's data. Only
    non-sensitive cosmetic state is kept: the theme choice and onboarding flags.

  SQL INJECTION PREVENTION
    All database queries use parameterized prepared statements via
    mysql2. No raw string interpolation in SQL.

  RATE LIMITING
    Auth endpoints: 20 requests per 15-minute window.
    Inventory endpoints: 60 requests per 15-minute window.

  INPUT VALIDATION
    All write operations validated server-side: type checks, length
    limits, enum whitelists, numeric range checks.
    Float tolerance (±0.01) for sale price arithmetic verification.

  SERVER-SIDE PRICE ENFORCEMENT
    Sale line totals are recalculated using database product prices,
    not client-supplied values. Clients cannot manipulate prices.

  SOFT DELETES
    Products are never hard-deleted. Deleted records get is_active=0,
    preserving sale history and audit trails.

  AUDIT LOG
    Every stock change (sale, restock, adjustment, damage, return)
    is written to inventory_adjustments with before/after snapshots
    and the user ID that performed the action.
    Phase 5 extends the audit trail with cash_movements, which captures
    every capital injection, withdrawal, expense, and auto-created
    restock cost — also tagged with the user ID that recorded it.

  ATOMIC TRANSACTIONS
    Sale creation is fully atomic (ACID). All-or-nothing: sale header,
    line items, stock deductions, and audit entries either all succeed
    or all roll back.
    Phase 5 extends atomicity to restock-with-payment: the
    inventory_adjustment row and its auto-created cash_movements row
    are written in the same transaction. A failure on either rolls
    back both — no orphan stock adds, no orphan expense entries.

  HTTP SECURITY HEADERS
    helmet.js sets OWASP-recommended headers on every response:
    X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, CSP.
    Because the backend serves the frontend on the same origin, the CSP applies
    to the pages. It keeps helmet's strict defaults (default-src/connect-src/
    img-src locked to 'self', no external origins — all libs are self-hosted)
    with one deliberate relaxation: script-src allows 'unsafe-inline' so the two
    inline page scripts (pre-paint theme applier + lucide.createIcons) run.
    script-src-attr stays 'none' (no inline event handlers in the markup). The
    app's primary XSS defense remains escaping user content on render
    (textContent), not the CSP. A future hardening pass can move those inline
    scripts to files + nonces and drop 'unsafe-inline'.

  CORS RESTRICTION
    Only the configured FRONTEND_URL origin is allowed. All other
    origins are rejected.

  REQUEST BODY SIZE LIMIT
    JSON body capped at 10 KB. Oversized requests are rejected before
    reaching application logic.

  GRACEFUL SHUTDOWN
    SIGINT and SIGTERM signals close the HTTP server and drain the
    database connection pool cleanly before the process exits.

  TENANT ISOLATION (Phase 6.5)
    Every owned-table query is scoped by store_id, threaded from
    req.user.storeId (signed into the JWT) through the controllers into the
    models — never read from a global. Entitlements resolve from the store's
    billing state PER REQUEST (loadStore + plans.effectivePlan), so a JWT can
    never elevate a plan. A dedicated suite (backend/test-tenancy.js) asserts
    that one store's token can't read or mutate another's data; it is the
    launch gate. UI gating is cosmetic only — the server is the boundary.

  BILLING INTEGRITY (Phase 6.6 — manual GCash bridge)
    Verify-first: a claim stays `pending` until a super-admin approves it; the
    amount is snapshotted server-side (never trusted from the client) and
    gcash_ref is globally UNIQUE (no reference reuse). Approval is transactional
    + idempotent (FOR UPDATE on a still-pending claim). Operator routes require
    role 'superadmin' (no tenant store) and 404 everyone else. The QR upload
    validates by magic bytes, caps size, and writes a random filename. ALL
    billing state changes go through the API (which reconciles cashier seats) —
    never raw DB. The owner's email/password change is admin-gated; cashier
    credentials are set/reset only by the store owner.

================================================================
[9. RUNNING THE PROJECT]
================================================================

  REQUIREMENTS
    - Node.js >= 18.0.0
    - MySQL 8.0 running locally

  SETUP

    1. Install dependencies
         cd backend
         npm install

    2. Create the database and tables
         mysql -u root -p < database/schema.sql

    3. Seed sample data (optional)
         mysql -u root -p celsopos_db < database/seed.sql

    4. Create backend/.env (see Section 7 for all variables)

    5. Start the server
         Development (auto-reload):   npm run dev
         Production:                  npm start

    6. Verify the server is up
         GET http://localhost:3000/api/health

  DATABASE MIGRATIONS (existing installs only)
    schema.sql uses CREATE TABLE IF NOT EXISTS, so it never alters an
    existing table. When a release adds columns, run the matching
    database/migrate_*.sql once as a privileged user (the app DB user has
    no DDL rights), e.g.:
         mysql -u root -p celsopos_db < database/migrate_inventory_costs.sql
         mysql -u root -p celsopos_db < database/migrate_loan_terms.sql
         mysql -u root -p celsopos_db < database/migrate_multitenant.sql
         mysql -u root -p celsopos_db < database/migrate_single_session.sql
    migrate_inventory_costs adds the Phase 5 cost columns to
    inventory_adjustments — without it, restock and stock adjustments 500.
    migrate_multitenant adds the stores table + store_id on every owned table
    (Phase 6.5; idempotent via schema_migrations). migrate_single_session adds
    users.session_id. Run BOTH before deploying the Phase 6.5 backend, or
    authenticated requests will 500 on the missing columns.

  FRONTEND CACHE BUSTING (per deploy)
    Static assets are referenced with a ?v=<version> query so browsers
    re-fetch them after a release (there is no build pipeline). Bump it on
    every deploy:
         node scripts/bust-cache.js 2     (omit the arg for a timestamp)

  RUNNING TESTS

    Server must be running. Tests use a live MySQL database.
    Test user: admin@celsopos.com / admin123

      node backend/test-checkpoint37.js   (37 security + integration checks)
      node backend/test-integration.js    (56+ end-to-end flow checks)

================================================================
[10. DEVELOPMENT ROADMAP]
================================================================

    Frontend → Backend → Database → AI → Finance → Deployment

  ──────────────────────────────────────────────────────────────
  PHASE 1: FRONTEND (HTML + CSS + JavaScript)       [COMPLETE]
  ──────────────────────────────────────────────────────────────

  All data is stored in localStorage during this phase.
  No backend or database is connected yet.

  MODULES BUILT:

    Module 1.1 — Login Page
      - Login form with validation
      - localStorage-based auth session
      - Redirect guard (checkAuth) used on all protected pages

    Module 1.2 — Register Page
      - Registration form
      - Stores user account in localStorage
      - Links back to login

    Module 1.3 — Dashboard Page
      - Summary cards: revenue, orders, products, low stock count
      - Low Stock Alerts: compact paginated table, priority-ordered
        (critical → high → medium), user-configurable row count
      - Recent Transactions: paginated table with "View History"
        link and user-configurable row count
      - Items popover on Recent Transactions: hover or tap a row
        to see the full itemized sale breakdown (toggle-controlled
        from Account Settings)
      - Invisible placeholder rows keep table height stable while
        paginating — no layout shift between pages
      - Sidebar navigation with active state
      - Topbar with theme toggle

    Module 1.4 — Product Management Page
      - Full CRUD: add, edit, delete products
      - Search and category filter
      - Per-product price and cost (cost is the source for COGS/profit)
      - Archive & restore: "delete" is a soft delete, so deleted items
        live in an "Archived" view (toolbar button) and can be restored
        with their full sale history intact. Re-adding a product whose
        name matches an archived one prompts "You archived this before —
        Restore it (keep history) or Add as new?", preventing silent
        duplicates that would fragment a product's history across two ids.
      - Note (Phase 5): the create form has no "stock" field — new
        products always start with stock = 0. Stock is added separately
        on the Inventory page via the per-product restock modal. This
        keeps Products focused on defining the item + pricing, and
        Inventory on quantity. After saving a new product, a one-tap
        "Add stock now →" toast links straight to that item's restock
        box on Inventory (admin only — restock is admin-gated).

    Module 1.5 — Inventory Page
      - Inventory table with status filters
      - Per-product restock modal
      - Stock status summary (total, ok, low, out)
      - Note (Phase 5): new products are created with stock = 0, so all
        stock is added here through the per-product restock modal. Restock
        is quantity-only — the money spent buying stock is recorded
        separately as a withdrawal on the Finance page, which keeps
        money-out single-entry (no double counting). A "+ New product"
        header link jumps to Products for items not yet in the catalog;
        conversely, the Products "Add stock now →" toast deep-links back
        here (?restock=<id>) and auto-opens that item's restock box.

    Module 1.6 — POS / Sales Interface (order.html)
      - Two-panel layout: product grid + cart (stacks on mobile)
      - Product search + category pill filters (collapse to a dropdown when
        the panel is narrow). Pressing Enter in the search box adds the first
        in-stock match and clears the box — fast search-and-add, and the hook
        a USB barcode scanner uses (it types the code and sends Enter).
      - Per-card stock dot (in-stock / low); out-of-stock products are hidden
        from the grid until restocked (an item fully added to the current cart
        shows disabled). Dots update live as the cart consumes stock.
      - Cart with quantity controls and an optional tax toggle
      - On-screen payment numpad — when active the field is readonly, so the OS
        keyboard never covers the total/checkout. Opens as a bottom sheet on mobile /
        centered popover on desktop, with a live Total/Payment/Change readout,
        additive denomination chips (₱5–₱1000) + an "Exact" shortcut, decimal
        entry, and physical-keyboard support. Live change calculation.
        Phones & tablets always use the numpad; desktop has a single toggle in
        Account → New Order (off by default — a keyboard owner types the amount
        directly and presses Enter to checkout). "Desktop" = the wide two-panel
        POS layout: width > 1000px (the POS-stacking breakpoint, re-checked live
        on resize) AND a non-touch pointer, so a tablet keeps the numpad too.
      - Sticky mobile cart bar (item count + total + "View Cart") once the
        cart has items
      - Checkout is disabled while the cart is empty and guarded against
        double-submit; stock is deducted server-side on checkout
      - Receipt header shows the configurable store name + address
        (set in Account → Store Info)
      - Hardened: product/item names are HTML-escaped before render (no
        stored XSS); all prices, stock, and tax are re-validated server-side

    Module 1.7 — Sales History Page
      - Filter by date range and payment method
      - Search by product or receipt number
      - Sale detail modal with full breakdown
      - Receipt reprint from history
      - Admin sale-edit: an Edit button inside the View/receipt modal
        (admin only) reopens the sale with qty steppers, per-line remove,
        the tax toggle, and live totals. Saving calls PUT /api/sales/:id,
        which reconciles stock, the audit log, and the sales_revenue
        cash movement server-side. Double-submit guarded.
      - Table hides when there are no sales so it no longer overlaps the
        empty-state card; all rendered cells (incl. cashier name) are
        HTML-escaped

    Module 1.8 — Receipt Generation
      - Shared receipt modal (used on POS and History)
      - Receipt number, date, cashier, itemized table
      - Subtotal, tax, total, payment, change
      - Browser print support

    Module 1.9 — Account Settings & Dropdown
      - Sidebar user card with popup dropdown
      - Account settings page: profile info, theme toggle,
        custom tax rate input (any percentage, 0–100), customizable stock status colors
      - Store Info: store name (max 21 chars) + address (max 80), auto-saved
        to the STORE row via PUT /api/settings/store-info (shared by the owner
        and all cashiers, so every operator's receipts match) and cached from
        the login/getMe response; rendered as the header on printed receipts
        (POS + History). The store name also drives the sidebar brand,
        falling back to "Celso POS" when blank.
      - New Order: a single "numpad on desktop" toggle (off by default);
        phones & tablets always use the numpad. Desktop owners type directly.
      - Dashboard row count controls: separate selectors for
        Low Stock Alerts rows and Recent Transactions rows
      - Items popover toggle: show or hide the transaction detail
        popover on the dashboard Recent Transactions table
      - Advanced Analytics toggle (off by default): unlocks the
        Tier 2 section on the Analytics page (monthly revenue goal,
        cashflow snapshot, inventory health). The goal's target value
        is set in-context on the goal card itself, not in Settings.
      - Settings sync to the backend database — persist across
        devices and sessions (localStorage is a cache only)

    Module 1.10 — Sales Reports Page (Scaffolded)
      - sales.html placeholder page with full app shell
      - "Coming soon" UI for future financial reports/analysis
      - Auth guard applied (checkAuth); ready for Phase 2+ data

  CROSS-CUTTING FEATURES (built across modules):

    Dark / Light Theme
      - Toggle via topbar button or account settings
      - Smooth, synchronized fade: every element transitions colors
        together over one shared duration (no staggered/laggy cards)
      - Persists across sessions (localStorage)
      - Applied before page paint to prevent flash; saved theme applies
        instantly on load (the fade only runs on user toggle)
      - Respects prefers-reduced-motion (instant snap, no fade)
      - Honored on the login and register screens too (survives logout)

    Analytics Page
      - Date range presets: Today, This Week, This Month, Last Month, Custom
      - Custom date range picker (capped at today; labeled card panel on mobile)
      - 8 KPI cards with period-over-period deltas:
          Tier 1 (always visible): Total Revenue, Transactions, Avg Order Value,
            Units Sold, Gross Profit, Profit Margin
          Tier 1 static: Total Assets (inventory at cost), Potential Margin
      - Health Badge: plain-English business health summary (Healthy /
        Steady / Worth a Look / Needs Attention) computed from revenue
        and margin deltas — shown on every page load
      - Charts: Revenue Over Time, Top Products by Revenue, Top Products
        by Quantity, Sales by Day of Week (busiest day highlighted)
      - Sales activity heatmap (GitHub-style, always visible, last 12 months)
      - Pinnable charts to dashboard via toggle

    Dashboard Analytics Section
      - Mini charts pinned from Analytics page
      - Compact heatmap
      - Link to full Analytics page

    Mobile Design
      - Responsive at five breakpoints: 1000px (POS stacks),
        800px (product grid compacts), 768px (primary mobile breakpoint
        + payment numpad becomes a bottom sheet), 600px (reduced padding,
        2-column grid), 480px (numpad denomination chips tighten to one row)
      - At ≤768px: sidebar hidden; hamburger menu appears in
        topbar and opens a slide-down nav panel with all six
        main pages; panel closes on navigation or outside tap
      - Mobile topbar shows the store logo; tapping it navigates
        to the POS (order) page
      - Floating Action Button (FAB) on all non-POS pages for
        one-tap access to New Order
      - POS product grid: 4–6 columns on desktop → 2 columns on
        mobile; category pills collapse to a select dropdown
      - POS payment uses an on-screen numpad (bottom sheet) instead of
        the OS keyboard, plus a sticky cart bar pinned to the bottom of
        the screen once the cart has items
      - Items popover uses tap-to-toggle on touch devices instead
        of hover
      - Touch targets sized to ≥28px minimum throughout

    Shared Utilities (data.js)
      - formatPeso() — centralized PHP currency formatting
      - Stock color theming via CSS variables
      - Customizable stock thresholds
      - localStorage seed data for demo/development

  ──────────────────────────────────────────────────────────────
  PHASE 2: BACKEND (Node.js + Express)              [COMPLETE]
  ──────────────────────────────────────────────────────────────

  MODULES BUILT:

    Module 2.1 — Express Server Setup
      - Node.js + Express server with CORS and JSON middleware
      - MVC folder structure (routes, controllers, models, middleware)
      - Environment config via .env (PORT, JWT_SECRET)
      - Live GET /api/products route as integration test

    Module 2.2 — Auth API (Login / Register)
      - bcrypt password hashing on register
      - JWT token issued on login (signed with secret, 1-day expiry)
      - authMiddleware verifies token and attaches user to req
      - Replaced all localStorage-based auth from Phase 1

    Module 2.3 — Products API (CRUD)
      - 7 endpoints: GET /api/products, GET /archived, GET /:id, POST,
        POST /:id/restore, PUT /:id, DELETE /:id
      - Server-side input validation on all write operations
      - JWT-protected writes; query-based filtering on reads
      - Archive/restore lifecycle: DELETE soft-deletes; GET /archived
        lists soft-deleted items; POST /:id/restore un-archives them.
        POST blocks an archived-name collision (409 archivedMatch) unless
        allowDuplicate is set, so re-adds restore rather than duplicate.
      - Note (Phase 5): POST body no longer accepts a "stock" field.
        New products are created with stock = 0; the controller
        forces this regardless of any client-supplied value.

    Module 2.4 — Sales API (Create + History + Edit)
      - POST /api/sales: atomic two-phase commit — validates stock
        and price server-side before recording sale and deducting stock
      - GET /api/sales: history with date-range filtering
      - GET /api/sales/summary: today's revenue, orders, top products
      - PUT /api/sales/:id (admin): atomic sale edit — locks the row,
        applies the per-line stock delta (return/deduct), logs balancing
        inventory_adjustments, recomputes the header from the original
        unit-price + tax-rate snapshot, and re-amounts the linked
        sales_revenue cash movement so Inventory/Finance/Analytics stay
        in sync. Only quantities, tax toggle, and payment are trusted.
      - All endpoints JWT-protected

    Module 2.5 — Analytics API
      - Multiple aggregation functions in sale.model.js (summary, heatmap,
        kpis, charts, profit, profitByProduct, inventoryHealth, goalProjectionInputs)
      - GET /api/analytics/summary: revenue, orders, avg order, units
      - GET /api/analytics/heatmap: daily activity grid (GitHub-style)
      - GET /api/analytics/kpis: KPI cards with prior-period comparison
      - GET /api/analytics/charts: revenue trend, top by revenue, top by
        quantity, revenue by day-of-week
      - GET /api/analytics/profit: gross profit + margin with prior-period comparison
      - GET /api/analytics/inventory-health: 90-day velocity buckets
        (slow movers / dead stock / days-of-stock turnover)
      - GET /api/analytics/projection: server-side goal projection —
        MTD revenue + trailing-30-day daily avg × days remaining
      - Date-range filtering; zero-gap daily seeding for chart rendering

    Module 2.6 — Inventory API (Role-Protected)
      - GET /api/inventory: full stock list (auth required)
      - GET /api/inventory/low-stock: items below threshold
      - GET /api/inventory/summary: stock status counts
      - POST /api/inventory/:id/adjust: signed-delta stock adjustment
        (admin-only); floors at zero; logs type, before/after, user
      - Note (Phase 5): the adjust endpoint accepts optional cost
        fields (unitCost, totalPaid, paymentMethod, supplierName)
        and a recordExpense toggle. On restock with recordExpense
        true, a cash_movements row (type='opex', category='restock')
        is auto-created in the same transaction. This path is
        backend-ready but unused by the current MVP UI (quantity-only
        restock); money-out is recorded manually on Finance instead.

    Module 2.7 — Frontend-to-Backend Integration
      - api.js: centralized JWT HTTP client (auto-attach token,
        handle 401, redirect to login on session expiry)
      - utils.js: loading states, toast error notifications
      - 7 page scripts migrated from localStorage to real API calls:
        dashboard, products, inventory, order, history, analytics, sales
      - 7 critical integration bugs resolved post-wiring (field name
        mismatches, broken date filters, charts sourcing wrong data)

  ──────────────────────────────────────────────────────────────
  PHASE 3: DATABASE (MySQL)                         [COMPLETE]
  ──────────────────────────────────────────────────────────────

  MODULES BUILT:

    Module 3.1 — Database Schema Design
      - 5-table relational model (Phase 3): users, products, sales,
        sale_items, inventory_adjustments
      - Phase 5 adds a 6th table: cash_movements (cashflow log
        with capital_in / owner_draw / opex / capex types)
      - Foreign keys, indexes, utf8mb4 charset, soft deletes

    Module 3.2 — Create Tables + Seed Data
      - schema.sql: all CREATE TABLE statements with constraints
      - seed.sql: sample users (admin + cashier), 10 products, a 2025–2026
        sales history (sales + items + matching sales_revenue), and Phase 5
        cash_movements (own + borrowed capital with loan terms, opex/capex,
        debt payments) so the dashboard, analytics, and Finance page open
        populated with realistic, period-over-period data.

    Module 3.3 — Connect Backend to MySQL
      - mysql2/promise connection pool (connectionLimit: 5)
      - Pool initialized on server start; connection tested on boot

    Module 3.4 — Migrate Models to SQL
      - user.model.js: all in-memory arrays replaced with SQL
        (findByEmail, findById, create with duplicate check)
      - product.model.js: full CRUD in SQL — soft delete,
        dynamic search/filter queries with prepared statements

    Module 3.5–3.6 — Sales + Analytics Pipeline Migration
      - sale.model.js: transactional create() atomically inserts
        sale header, line items, deducts stock, and logs adjustments
      - 5 SQL aggregation functions: summary, heatmap, kpis,
        charts (top products, day-of-week, daily revenue trend)
      - GROUP BY fix applied for MySQL 8 strict mode
      - All analytics endpoints wired with async/await and
        date-range defaults

    Module 3.7 — Security Hardening + Integration Testing
      - JWT_SECRET rotated to 128-character cryptographic value
      - Database restricted to least-privilege MySQL user
        (celsopos_app with SELECT/INSERT/UPDATE on celsopos_db only)
      - Rate limiting added to auth endpoints (20 req / 15 min)
      - 32 automated integration checks against live MySQL database
        — all passing

    Module 3.8 — Pre-Phase 4 QA Hardening
      - helmet.js: OWASP security headers on all responses
      - morgan: HTTP request logging (dev format)
      - CORS locked to FRONTEND_URL environment variable
      - JSON body size capped at 10 KB (DoS protection)
      - Env var fail-fast: server exits on missing required vars
      - Graceful shutdown: SIGINT/SIGTERM drains pool cleanly
      - Rate limiting extended to /api/inventory (60 req / 15 min)
      - Error response format normalized to
        { success: false, message } across all routes
      - Node.js engine requirement set to >=18.0.0

  ──────────────────────────────────────────────────────────────
  PHASE 3 ENHANCEMENTS (Post-Phase 3 QA)            [COMPLETE]
  ──────────────────────────────────────────────────────────────

    Module 3.9 — Dashboard UX Overhaul
      - Low Stock Alerts redesigned: compact paginated table with
        priority ordering (critical → high → medium)
      - Recent Transactions redesigned: paginated table with a
        "View History" link and user-configurable row count
      - Items popover: hover or tap a transaction row to see the
        full itemized sale breakdown; controlled from Account
        Settings
      - Invisible placeholder rows lock table height during
        pagination to prevent layout shift

    Module 3.10 — User Preferences Sync
      - All user preferences (theme, row counts, popover toggle,
        nav labels) now persist to the
        backend database in a JSON column on the users table
      - localStorage used as a write-through cache only
      - Settings survive across devices and browser clears

    Module 3.11 — Mobile UI Refinements
      - Hamburger menu navigation for screens ≤768px
      - Mobile topbar logo with tap-to-navigate to POS page
      - Floating Action Button (FAB) on all non-POS pages
      - Touch-optimized popover behavior (tap-to-toggle)
      - POS product grid compresses to 2 columns on mobile
      - Category pill filters collapse to a dropdown on mobile

  ──────────────────────────────────────────────────────────────
  PHASE 4: AI INTEGRATION                           [COMPLETE]
  ──────────────────────────────────────────────────────────────

  PROVIDER DECISION:
    Primary  : Groq — llama-3.3-70b-versatile
               Free tier: ~1,000 RPD on 70B, no billing gate, no credit card
               OpenAI-compatible REST API. Sign up at console.groq.com.
    Fallback : DeepSeek V3 ($0.14/$0.28 per M tokens) if Groq limits hit
               Interface: getCompletion(messages, options) — provider-agnostic

  WHY NOT CLAUDE API OR GEMINI FREE TIER:
    Claude API requires a paid Anthropic account.
    Gemini free tier on new Google accounts (post-March 2026) requires
    billing setup before any API calls succeed — a hard gate for new PH-region
    accounts. Groq has no such requirement and works immediately after signup.

  ARCHITECTURE PRINCIPLES:
    - Server-side prompt assembly only. Frontend sends { message, history };
      backend builds full context. Same security principle as server-side prices.
    - Context aggregation before sending: inventory snapshot + 30-day sales
      + cashflow summary assembled in context-builder.js.
    - No PII in context: aggregates only (top products by revenue/qty, stock
      levels, day-of-week patterns) — no individual transactions or cashier IDs.
    - Response caching: non-streaming queries cached by MD5(question + date).
      Cuts 60-80% of redundant Groq API calls.
    - Fallback routing: Groq primary → DeepSeek on 429/503. Route handlers
      are provider-agnostic via getCompletion(messages, options) interface.

  FILES BUILT:
    ai/providers/groq.js              ← Primary LLM provider (Groq Llama 3.3 70B)
    ai/providers/deepseek.js          ← Fallback provider (DeepSeek V3)
    ai/context-builder.js             ← DB aggregation: sales, inventory, cashflow
    ai/prompts/system.js              ← System prompt + onboarding prompt
    ai/assistant.js                   ← Orchestrator: provider routing + MD5 cache
    backend/routes/ai.routes.js       ← 6 endpoints (chat, stream, summary,
                                          restock, forecast, profit)
    backend/controllers/ai.controller.js
    frontend/pages/ai.html            ← Os Full View (distraction-free chat)
    frontend/css/pages/ai.css         ← Full View page styles
    frontend/css/os.widget.css        ← Docked widget panel (overlay + sheet)
    frontend/js/pages/ai.js           ← Full View shell — delegates streaming
                                          to OsClient, owns onboarding cards
    frontend/js/components/os.client.js  ← Pure chat client (no DOM): SSE
                                              streaming, sessionStorage history,
                                              AbortController cancellation
    frontend/js/components/os.widget.js  ← Messenger-style docked chat panel
                                              (desktop overlay, mobile sheet)
    frontend/js/components/os.js      ← FAB bootstrapper + sidebar link wiring

  MODULES:
    Module 4.1 — Groq + DeepSeek Providers                [COMPLETE]
      - ai/providers/groq.js: OpenAI-compatible fetch call to Groq endpoint
      - ai/providers/deepseek.js: identical interface, DeepSeek V3 endpoint
      - GROQ_API_KEY added to .env with fail-fast validation on server start
      - Provider-agnostic interface: getCompletion(messages, options)
      - stream: true passes raw Response to caller for SSE relay

    Module 4.2 — Context Builder                           [COMPLETE]
      - ai/context-builder.js: queries sale.model + product.model + cashflow.model
      - Today's performance, 30-day KPIs, top 5 by revenue, top 5 by qty,
        out-of-stock list, low-stock list, busiest days, cashflow summary
      - Financial context: moneyIn / moneyOut / net / utang (debtBalance) —
        lets Os answer "bayaran ko ba muna utang ko o mag-restock?" with real
        numbers, not generic advice

    Module 4.3 — System Prompt + Sari-Sari Framing         [COMPLETE]
      - ai/prompts/system.js: Filipino MSME context, Tagalog-friendly tone
      - Domain-specific: restock, slow movers, safe withdrawal, busy days
      - Cashflow vocabulary: puhunan (capital), utang (borrowed balance),
        kuha / owner_draw, gastos (opex/capex), kita (sales_revenue)
      - Declines off-topic questions; bases every answer only on provided data
      - Also exports OS_ONBOARDING_PROMPT for guided first-run flow

    Module 4.4 — API Routes + Per-user Rate Limiting       [COMPLETE]
      - 6 JWT-protected endpoints, 20 req/15 min per user (in-memory map)
      - POST /api/ai/chat:        non-streaming, MD5-cached response
      - POST /api/ai/chat/stream: SSE streaming (chat UI uses this)
      - GET  /api/ai/summary:     daily brief → { summary, urgency, tip }
      - GET  /api/ai/restock:     ranked restock list → { items[] }
      - GET  /api/ai/forecast:    tomorrow's forecast → { day, expectedRevenue }
      - GET  /api/ai/profit:      margin insights → { insights[], summary }

    Module 4.5 — Chat UI + Os FAB                          [COMPLETE]
      - frontend/pages/ai.html: Full View chat page (deep-link / no-JS
        fallback / "Open in full view" target from the docked widget)
      - Suggestion chips (6 quick questions in Taglish)
      - Session history restored from sessionStorage on page load
      - "Clear conversation" button resets both UI and sessionStorage
      - frontend/js/components/os.js: floating "Os" button on all 9 app
        pages; respects osEnabled pref; toggled live from Account Settings
      - AI is opt-in (BETA): the only discovery surface is the Account
        Settings toggle. Once enabled, the FAB appears on every page
        and toggles the docked chat panel. Full View (ai.html) remains
        as a focused deep-link mode reachable via the "Open in full
        view ↗" link inside the docked panel header.

    Module 4.6 — Onboarding Tour                           [COMPLETE]
      - Role-aware onboarding: 4-step admin tour, 3-step cashier tour
      - Tour runs automatically on first Os enable; re-triggerable via chat

    Module 4.7 — Docked Os Widget (Messenger-style)        [COMPLETE]

      The full-page-only chat was reworked into a docked floating panel
      that overlays the host page — same surface MSME owners already
      know from FB Messenger / GCash chat. Owner can ask "magkano utang
      ko?" while standing on the Inventory page without losing context.

      ARCHITECTURE — three-layer split:
        os.client.js  ← pure JS, no DOM. Owns streaming, history,
                        cancellation. Reused by both the widget and
                        the Full View page. Also the canonical surface
                        for the upcoming React Native / Capacitor app.
        os.widget.js  ← the UI shell. Lazy-mounts DOM on first open;
                        manages open/close/toggle, focus, scroll lock.
        os.js         ← bootstrapper. Mounts the FAB and hides it
                        on ai.html (where Full View IS the chat).

      RESPONSIVE LAYOUT — one widget, two surfaces:
        Desktop / tablet (≥769px):
          380px × min(620px, calc(100vh − 100px)) panel docked
          bottom-right; no backdrop; host page stays interactive.
          FAB fades out via .os-widget-open body class while open.
        Mobile (≤768px):
          Full-screen bottom sheet (height: 92dvh) — `dvh` so the
          mobile keyboard doesn't push the layout. Drag handle at
          the top, backdrop tap closes, body scroll + touch-action
          locked while open.

      PERSISTENCE:
        sessionStorage.osHistory      — conversation (owned by OsClient)
        sessionStorage.osPanelOpen    — open state across page nav.
        If the panel was open on Dashboard and the user clicks into
        Inventory, the panel auto-reopens with the same history.
        Onboarding guard: if the welcome modal or spotlight tour is
        mounted, auto-restore defers — the user reopens via FAB.

      ACCESSIBILITY:
        - role="dialog"; aria-modal switches: true on mobile (sheet
          dims the page), false on desktop (panel is non-modal overlay)
        - aria-live="polite" on the messages region so screen readers
          announce streamed text fragments as they arrive
        - ESC closes; focus trap activates only on mobile; focus is
          restored to the prior element on close
        - All assistant text inserted via textContent — never innerHTML
          (same XSS posture as the legacy chat page)

      INTERACTION DETAILS:
        - FAB click → OsWidget.toggle()
        - "Open in full view ↗" link in panel header → ai.html
        - Close button cancels any in-flight stream via AbortController
          so we don't keep tokens streaming after the user leaves
        - Suggestion chips (6 Taglish quick questions) hide on first
          message and reappear after "Clear conversation"

      Z-INDEX STACK (project-wide, lowest to highest):
        FAB ........................... 40
        sidebar / topbar / modals ..... 90 – 500
        Os panel ...................... 8500
        Os mobile backdrop ............ 8400
        onboarding spotlight + tooltip  9000 / 9001
        onboarding welcome modal ...... 9999

      MOBILE-APP READINESS:
        os.client.js has zero DOM dependencies — it can be ported
        verbatim into a React Native screen, or its SSE protocol can
        be re-implemented in any client. Web + native end up sharing
        the same chat semantics (rate limits, history shape, prompt
        assembly, provider fallback) without server changes.

      WIDGET LIFECYCLE FILES:
        frontend/css/os.widget.css            ← panel + sheet styles
        frontend/js/components/os.client.js   ← chat client
        frontend/js/components/os.widget.js   ← panel UI shell
        frontend/js/components/os.js          ← FAB + sidebar wiring
        All 9 app HTML pages updated to load os.widget.css and the
        three JS files in correct order (os.client → os.widget → os).
        ai.html loads os.client.js only — Full View consumes the chat
        client directly and never mounts the docked panel on itself.

  ──────────────────────────────────────────────────────────────
  PHASE 5: FINANCE MODULE (Cashflow Log)            [COMPLETE]
  ──────────────────────────────────────────────────────────────

  PURPOSE:
    A simple cashflow log that helps owners remember what they often
    forget — capital injected, expenses paid, withdrawals taken, and
    how much utang (borrowed capital) is still outstanding.

    Five transaction types in one table (four manual + one auto):
      capital_in     Money put into the business (own or borrowed)
      owner_draw     Money the owner takes out (personal / loan payment /
                     reinvest / other)
      opex           Recurring operational costs (rent, utilities, restocks)
      capex          One-time asset purchases (equipment, furniture, signage)
      sales_revenue  Auto-created by POS on every checkout (never manual)

    This is NOT a full financial system — no equity calculations,
    no daily reconciliation rituals, no safe-draw warnings, no loan
    amortization schedules. Just: "record what happened, show the totals."

  KEY DESIGN PRINCIPLES:
    - One dedicated page, accessible from sidebar
    - Add Entry modal: type-aware subcategory selectors (category
      required), with borrowed-loan repayment terms; fast entry
    - Sales auto-log as sales_revenue (source='sale') so revenue
      appears inline with cashflow without double entry
    - Money spent buying stock is recorded manually on the Finance page
      (a capital withdrawal). Restock is quantity-only and does NOT
      auto-log an expense, so money-out stays single-entry (no double
      counting). The backend can auto-create a restock opex row, but the
      MVP UI deliberately doesn't trigger it — reserved for a future
      dedicated inventory module.
    - Product creation locked to initial stock = 0 — this separates
      concerns: Products defines the item and its cost, the Inventory
      page adds quantity. All stock entry flows through the restock modal.

  REAL-WORLD CONTEXT (why this scope matters):
    PH MSME owners often borrow their starting capital from microfinance
    (CARD MRI, ASA), cooperatives, 5-6 lenders, family, or pawn shops.
    Withdrawals are frequently loan-servicing, not personal spending.
    Subcategorizing capital_in (own vs borrowed) and owner_draw
    (personal vs debt_payment vs reinvest) lets the app compute a
    derived "Utang" balance — answering "magkano pa ba utang ko?" —
    without introducing a separate loans table.

  CATEGORY CONVENTIONS:
    type=capital_in:
      'own'           Sariling pera
      'borrowed'      Hiniram (notes capture lender name)

    type=owner_draw:
      'personal'      Sariling gamit / household
      'debt_payment'  Bayad sa utang / loan repayment (notes capture which loan)
      'restock'       Stock purchase recorded as owner withdrawal
      'opex'          Operating expense drawn by owner
      'other'         Iba pa

    type=opex / capex:
      Free-form category (rent, utilities, transport, equipment,
      furniture, restock, supplies, other, etc.)

    type=sales_revenue:
      No subcategory — auto-created only; source='sale'

  SCHEMA ADDITIONS:
    New table: cash_movements (id, type, category, amount, monthly_due,
                               term_months, description, occurred_at, source,
                               source_id, recorded_by, is_active, created_at)
    Altered:   inventory_adjustments (+ unit_cost, total_paid,
                                       payment_method, supplier_name)
    Altered:   products (initial stock locked to 0 on creation —
                         enforced at controller layer, not column)
    See Section 4 [DATABASE SCHEMA] for full column definitions.

  MODULES:
    Module 5.1 — Cashflow Schema + Model               [COMPLETE]
      - cash_movements table in schema.sql (6-table schema)
      - inventory_adjustments Phase 5 columns added
      - cashflow.model.js: CRUD + period summary aggregation
        (moneyIn, moneyOut, net, utang, byType, byCategory)
      - VALID_TYPES includes sales_revenue; type/category validation
        enforced at model layer

    Module 5.2 — Finance API                           [COMPLETE]
      - GET    /api/finance          list, filterable by type/category/date
      - GET    /api/finance/summary  period totals + utang balance
      - POST   /api/finance          create manual entry
      - PUT    /api/finance/:id      edit (manual entries only)
      - DELETE /api/finance/:id      soft-delete (admin only)
      - Auto-created entries (source ≠ 'manual') are read-only:
        edit and delete are blocked at the controller

    Module 5.3 — Finance Page UI                       [COMPLETE]
      - finance.html + css/pages/finance.css + js/pages/finance.js
      - Top row: four summary cards + a cumulative-cash chart
          ┌────────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐
          │ Net Balance│ │ Profit │ │  Debt   │ │  Total  │ │ Cumulative│
          │ Cash on    │ │ (in-   │ │ Balance │ │ Capital │ │   Cash    │
          │ hand       │ │ card   │ │         │ │Own/Borr.│ │ Position  │
          │            │ │ period │ │         │ │         │ │ chart     │
          └────────────┘ └────────┘ └─────────┘ └─────────┘ └──────────┘
        Net Balance:       all-time Money In − Money Out (cash on hand).
        Profit:            revenue − COGS − opex − capex over a period
                           controlled by an in-card dropdown
                           (All Time / This Month / Last Month /
                           Last 3 Months / This Year). Subtitle always leads
                           with the margin %; for a bounded period whose prior
                           window had activity it also appends a named ↑/↓
                           trend (e.g. "32.1% margin · ↑ ₱500 vs last month").
                           All Time shows margin only (no prior to compare).
                           An info icon by the label opens a hover/tap tooltip
                           explaining what each period covers.
        Debt Balance:      total loan obligation − debt_payment, floored at 0
                           (a loan's obligation = monthly_due × term_months
                           when set, else its principal); toggleable via
                           localStorage flag.
        Total Capital:     lifetime SUM(capital_in), shown as Own / Borrowed
                           where Own = Total − Borrowed, so the split always
                           reconciles (uncategorized capital counts as Own).
        Cumulative Cash:   live SVG line chart with min/max ₱ labels
                           on the Y axis, first/last date labels on
                           the X axis, and capital-injection markers
                           on the curve. Granularity (daily → weekly
                           → monthly → annually) adapts to card width
                           via ResizeObserver; no external dependencies.
      - Filter dropdown: [All Types] [Daily Sales] [Capital In]
        [Withdrawal] — filters table rows; summary always shows totals
      - Cash flow list (date, type + category + source chip, signed
        amount, notes) paginated at 20 rows; daily sales grouped into
        single rows. Auto-created rows show a "from Restock" / "from
        POS" pill in the description cell. (In the current MVP the app
        never creates new "from Restock" rows — restock is quantity-only
        and writes no cash_movements row; that pill is dormant rendering
        for the backend-ready restock-expense path, and for any such rows
        present in seed/demo data — see Phase 5.)
      - "+ Add Entry" button (admin only) → modal:
          • Type selector: Capital In | Withdrawal
          • Category selector swaps based on type (required)
          • Amount, Date, Notes — Amount/Notes stay disabled until both
            Type and Category are chosen (no unclassified entries)
          • Borrowed capital also reveals Monthly payment + Months to pay,
            with a live "total to repay" readout; their product becomes the
            loan's debt obligation
      - Debt Balance card shows a "Pay Debt" shortcut (admin, when debt > 0)
        that opens this modal preset to a debt payment (Type + Category
        filled); the owner types the amount, which is capped at the
        outstanding balance
      - Auto-created entries (restock, sale) are read-only;
        manual entries show Edit / Delete kebab menu (admin only)
      - Pagination: 20 entries per page, shared pagination component

    Module 5.4 — Restock Integration + Product Creation Lock [COMPLETE]
      - inventory_adjustments schema extended with unit_cost,
        total_paid, payment_method, supplier_name columns (backend-ready
        cost capture; the MVP restock UI is quantity-only and doesn't use
        them — money-out is recorded manually on Finance)
      - Products controller enforces initial stock = 0 on create
      - Finance sidebar link added between Products and Analytics
      - "Finance" appears in every page's sidebar nav

  ──────────────────────────────────────────────────────────────
  PHASE 6: USER ONBOARDING SYSTEM                   [COMPLETE]
  ──────────────────────────────────────────────────────────────

  PURPOSE:
    Guide first-time users through the app immediately after
    registration. Non-technical MSME owners see a guided
    spotlight tour, a setup checklist, and empty-state prompts
    so they always know what to do next. No backend changes
    required — all state is localStorage-based.

  LAYERS:
    Layer 1 — Welcome Modal      (first login, dashboard only)
    Layer 2 — Setup Checklist    (dashboard card, dismissible)
    Layer 3 — Page Spotlight     (per-page, first visit only)
    Layer 4 — Empty State Prompts (no-data fallback screens)

  NEW FILES:
    frontend/css/onboarding.css
    frontend/js/onboarding/onboarding.core.js
    frontend/js/onboarding/onboarding.welcome.js
    frontend/js/onboarding/onboarding.checklist.js
    frontend/js/onboarding/onboarding.tour.js
    frontend/js/onboarding/onboarding.tours.js

  MODULES:

    Module 6.1 — Onboarding Core (State Manager)       [COMPLETE]
      - Central localStorage state manager for all onboarding
        modules (welcome, checklist, tour, empty states)
      - Tracks: welcome seen, checklist dismissed, checklist
        progress per item, tour seen per page
      - Exposes resetAll() for dev/debug use
      - Role-aware: reads admin | cashier from auth session

    Module 6.2 — Welcome Modal                         [COMPLETE]
      - Full-screen overlay on first login (dashboard only)
      - Two panels: value proposition + critical path preview
      - Role-aware copy: admin sees 4-step path,
        cashier sees 2-step path
      - No skip button — short enough to click through
      - On close: marks welcome as seen, fires checklist +
        sidebar pill init; scroll locked on .page-body during
        display and restored on close

    Module 6.3 — Setup Checklist                       [COMPLETE]
      - Persistent card at top of Dashboard until dismissed
      - Admin: 4 items (Add Product → Restock → Sell → Dashboard)
      - Cashier: 2 items (Make Sale → Check History)
      - Auto-checks each item when the task is actually completed
        (hooks into save/restock/checkout/history success callbacks)
      - Progress bar and sidebar pill show "N of 4 done"
      - X button dismisses permanently at any time
      - All items done → celebration message → auto-dismiss
      - "Restart Onboarding" button on Account Settings page:
        resets all onboarding localStorage state (welcome seen,
        checklist progress, all tour-seen flags) and redirects
        to the Dashboard so the full flow replays from the start

    Module 6.4 — Spotlight Tour Engine                 [COMPLETE]
      - Reusable engine: accepts a step array, runs the tour
      - Per step: scrolls target into view, computes bounding
        box, renders SVG spotlight hole + tooltip bubble
      - Tooltip: title, body, Skip Tour button, Next button
      - Viewport-safe positioning: vertical and horizontal
        clamping prevents tooltip from clipping off-screen;
        position flip threshold raised to 180px
      - Debounced resize handler recalculates spotlight and
        tooltip on window resize (150ms debounce)
      - Page scroll and tap locked during tour via .page-body
        overflow:hidden; pointer-events:auto on overlay div
        blocks all interaction except tooltip buttons
      - Defers start via MutationObserver if welcome modal is
        open — no overlap between layers on first login
      - Fires on first page visit only; never repeats after
        completion or skip
      - mobileTarget field: resolves to an alternate selector
        on viewports ≤768px — used on Order/POS so the cart
        spotlight fits the mobile layout
      - Auto-skip: if the resolved target is display:none or
        absent from the DOM (e.g. no table rows, hidden admin
        button), the step is silently skipped
      - ARIA: tooltip rendered as role="dialog" aria-modal="true"
        aria-labelledby / aria-describedby / aria-live="polite";
        SVG overlay marked aria-hidden="true"
      - Keyboard & focus trap: focus locked inside the tooltip
        bubble while the tour is active; Escape key skips tour
      - Last-step celebration: instead of "Next" on the final
        step, the tooltip shows a confetti checkmark + "You're
        all set!" then auto-dismisses after a short delay
      - CSS animation fix: translate(-50%,-50%) placed inside
        the celebration keyframe's final state so the animation
        cascade cannot override the centering transform

    Module 6.5 — Tour Step Definitions                 [COMPLETE]
      - All step copy and selectors defined in one file
        (onboarding.tours.js) — engine reads, never hard-codes
      - Pages covered:
          Products  (3 steps): add button, search bar, product table
          Inventory (4 steps): summary cards, stock table,
                               restock button, stock-dot legend
          Order/POS (4 steps): product grid, cart panel,
                               payment input, checkout button
          Finance   (4 steps): net balance card, cash-flow chart,
                               add-entry button, finance table
          Dashboard (2 steps): summary cards, low-stock alerts
      - Targets use data-onb-id attributes and stable IDs so
        tours survive style refactors
      - Copy is plain English, one sentence per tooltip body
      - bodyWhenEmpty field: each step that has preview data
        carries a second body string used when example content
        is injected — "these rows show what it'll look like"
        rather than asserting data that isn't there yet

    Module 6.6 — Empty State Prompts                   [COMPLETE]
      - Replaces blank tables with a helpful card + CTA when
        there is no data to display
      - Products page: "No products yet — Add your first product"
      - Order page: "Your catalog is empty — Go to Products"
      - History page: "No sales yet — Make your first sale"
        (hard-coded in history.html using onboarding CSS classes)
      - Inventory page: "Nothing to stock — Add Products first"
      - Shared renderEmptyState() helper in OnboardingCore used
        by products, inventory, and order page scripts

    Module 6.7 — Integration Hooks                     [COMPLETE]
      - Small additions to existing page scripts only
      - dashboard.js: Welcome + Checklist init gated so checklist
        and sidebar only mount after welcome modal closes;
        viewDashboard auto-completes when sales data is detected
      - products.js: tour start + addProduct completion hook
      - inventory.js: tour start + restock completion hook
      - order.js: tour start + makeSale completion hook
      - history.js: viewHistory completion hook for cashier flow
      - sidebar.js: SidebarProgress pill init and update

    Module 6.8 — CSS Architecture                      [COMPLETE]
      - All onboarding visual styles in frontend/css/onboarding.css
      - Linked on all 9 app pages (dashboard, products, inventory,
        order, history, analytics, finance, ai, account)
        Note: finance.html was missing the <link> at launch and
        was fixed post-ship — the tour was rendering as unstyled
        HTML until the link was added.
      - Onboarding JS scripts (core, welcome, checklist, tours,
        tour) added to all 9 app pages in correct load order
      - Uses only CSS variables from main.css — dark mode
        compatible with zero extra rules
      - 7 sections: shared utilities, welcome modal, checklist
        card, sidebar pill, spotlight tour, empty states,
        responsive (mobile bottom-sheet + touch targets)

    Module 6.9 — Tour Preview Injection System         [COMPLETE]
      - Brand-new users see illustrative PH-MSME sample data in
        every empty card, table, and chart while the tour is
        running — so the spotlight feels alive rather than blank.
      - Step schema: each step may declare a `preview` field:
          { selector, html, when }   (single injection point)
          [ { ... }, { ... } ]       (multiple injection points)
        selector — child of the tour target to inject into;
                   omit to use the target itself
        html     — replacement innerHTML
        when     — 'empty' (inject only when element has no
                   real data), 'always', or a function(el)
      - "Example" badge (onb-preview-badge) is added to the
        spotlight host when at least one injection fired — so
        users can see at a glance that the numbers are illustrative.
      - _injectedPreviews array tracks every injection (original
        HTML + target reference); guaranteed rollback on
        next / skip / finish — zero fake data ever persists in
        real app state after the tour step exits.
      - Preview data per tour:
          Products  — 3 sample product rows (Pandesal, Coca-Cola,
                      Lucky Me) with names, categories, prices
          Inventory — 4 summary card values (142 items, 24 products,
                      3 low, 1 out); 3 stock-table rows with
                      color-coded stock dots
          Order/POS — cart panel with 3 pre-filled cart lines
                      (Pandesal ×5, Coca-Cola ×1, Pancit Canton ×2)
          Finance   — net balance (₱12,450.00); animated SVG
                      sparkline (gradient + polyline using CSS vars);
                      3 cashflow table rows (sale, capital, withdrawal)
          Dashboard — 4 summary card values (₱5,400.00 revenue,
                      24 products, 3 low stock, 12 transactions);
                      3 low-stock alert rows

  ──────────────────────────────────────────────────────────────
  PHASE 6.5: MULTI-TENANT SAAS                      [COMPLETE *]
  ──────────────────────────────────────────────────────────────

  Converts the app from single-store to a subscription SaaS where each
  signup creates its own ISOLATED store. Runs BEFORE Phase 7 so the app
  deploys SaaS-ready. The original build spec (paste-ready code, per-module
  QA checklists, build order) lives in celsopos_P6-5.txt at the repo root.
  * Tenancy / RBAC / Team are complete. The billing approach was replaced in
    Phase 6.6 (manual GCash bridge) — see that section below.

  PLANS (monthly, PHP) — set in Phase 6.6; features are tiered AND seats grow:
    Free  ₱0     Dashboard(basic), New Order, Inventory, Products, History;
                 0 cashiers.
    Basic ₱299   + Finance + Analytics + dashboard charts;   0 cashiers.
    Plus  ₱799   + Advanced Analytics + AI Assistant (Os);   1 cashier.
    Pro   ₱1299  same features as Plus;                      2 cashiers.
    - 14-day Basic trial (no card, auto on signup) → Free on expiry.
    - Cashiers are sub-accounts the owner creates on a Team page. Passwords
      are ADMIN-MANAGED: the owner sets a cashier's password and can reset it
      anytime; cashiers can't change their own and have no Account Settings.
      Cashier role = New Order + Sales History + Logout only, on any plan.

  TENANCY MODEL:
    - A `stores` table + `store_id` on every owned table (users, products,
      sales, inventory_adjustments, cash_movements). EVERY query is scoped to
      the caller's store; a tenant-isolation suite (backend/test-tenancy.js)
      is the launch gate.
    - Entitlements resolve from the store's billing state PER REQUEST (never
      from the JWT) via backend/config/plans.js. tenant.middleware.js attaches
      req.store/req.plan (loadStore) and gates features (requireFeature → 402
      plan gate; 403 = role). Signup creates a store + its owner-admin
      (replaces the single-tenant first-account-admin rule).
    - The server is the boundary; the UI mirrors it (nav hidden by feature,
      page guards, dashboard-charts upsell, AI FAB + advanced-analytics toggle
      gated). UI gating FAILS OPEN when entitlements are unknown.
    - Per-store timezone (was a single global app_settings value).

  BILLING — see Phase 6.6 below. (The original Lemon Squeezy Merchant-of-Record
    plan was replaced by a manual GCash bridge: PH MSME buyers pay by GCash, not
    card, and an aggregator needs business registration the founder doesn't have
    yet. A billing change still reconciles cashier seats — suspends the newest
    excess on downgrade, reactivates on re-upgrade — and never deletes data.)

  MODULES (build order):
    6.5a Tenancy core — plans.js, stores schema + migrate_multitenant.sql,
         store_id scoping across all models, loadStore/requireFeature,
         store-creation signup, test-tenancy.js (GREEN).            [COMPLETE]
    6.5b RBAC UI gating — login/me return entitlements; sidebar hides
         non-entitled nav; page guards; dashboard charts upsell; FAB/toggle
         gating.                                                    [COMPLETE]
    6.5c Lemon Squeezy billing — SUPERSEDED by Phase 6.6 (manual GCash bridge).
    6.5d Team + Billing UI — Team page (add / deactivate / reset-password /
         delete cashiers, per-plan seat limit) [COMPLETE]. Billing page rewritten
         in 6.6 (4 tiers + GCash claim modal).
    6.5e Hardening — security review, store_id in the integration suites,
         this README.                                              [IN PROGRESS]

  SCOPE (v1): Asia/PH, PHP only. AI stays on the Groq free tier.
  Deferred: multi-currency, email invites, annual billing, Redis scaling.

  ──────────────────────────────────────────────────────────────
  PHASE 6.6: MANUAL GCASH BILLING BRIDGE             [IN PROGRESS]
  ──────────────────────────────────────────────────────────────

  Replaces the Phase 6.5 Lemon Squeezy billing with a manual GCash flow good for
  the first ~50 paying stores while the founder isn't yet a registered business.
  Full build spec: celsopos_P6-6.txt at the repo root. PayMongo (native GCash/Maya
  recurring) is the documented successor once registered + at scale (P6-6 §13).

  HOW IT WORKS:
    - Tiers are PHP (free/basic/plus/pro = ₱0/₱299/₱799/₱1299; seats 0/0/1/2);
      14-day trial grants Basic. Entitlement resolves per request via
      config/plans.resolveBilling — paid while now <= paid_until + 3-day grace,
      lazily (no cron), grandfathering active rows with no paid_until.
    - Owner opens the shared Upgrade modal (billing.modal.js), pays the global
      GCash QR, and submits the reference number → a `pending` payment_claims row
      (VERIFY-FIRST; the plan does not change yet).
    - The platform SUPER-ADMIN (a user with no tenant store, role 'superadmin';
      seeded by scripts/create-superadmin.js) reviews claims in pages/admin.html
      and approves/rejects. Approve is transactional + idempotent, anchors the new
      paid_until to the due date, and reconciles cashier seats.
    - Nav is SHOW-LOCKED for owners (greyed paid links open the modal) and HIDDEN
      for cashiers. The dashboard shows one reminder/upsell card (grace > trial >
      free promo). First-login welcome reveals the trial gift (owner-only confetti).

  MODULES (build order — see celsopos_P6-6.txt §11):
    6.6a plans.js (PHP tiers + grace) + schema/migrate_billing_bridge.sql  [DONE]
    6.6b tenant billing: claim/state, retire Lemon Squeezy                 [DONE]
    6.6c super-admin API: approve/reject + QR upload                       [DONE]
    6.6d GCash Upgrade modal + billing page rewrite                        [DONE]
    6.6e show-locked nav                                                   [DONE]
    6.6f dashboard reminder/upgrade cards                                  [DONE]
    6.6g operator dashboard (admin.html)                                   [DONE]
    6.6h README sync + test-tenancy claims/super-admin additions           [DONE]

  PRICING NOTE: prices live in code (config/plans.js pricePhp), not the DB —
  only the plan enum (free|basic|plus|pro) is persisted.

  ──────────────────────────────────────────────────────────────
  PHASE 7: WEB APP DEPLOYMENT
  ──────────────────────────────────────────────────────────────

  DEPLOYMENT TOPOLOGY (important — drives every module below):
    The frontend is served BY the backend as a single origin, NOT split
    across two hosts. frontend/js/core/api.js derives its API base from
    `window.location.origin + '/api'`, so the page and the API must share
    one origin. The app therefore deploys as ONE Node service that serves
    both the static frontend and the /api routes. Benefits: api.js needs no
    change, CORS is a non-issue (same origin), one URL, one TLS cert. A
    CDN can be layered in front later if static-asset load ever matters.

  MODULES:
    Module 7.1 — Pre-deploy prep
      - Serve the frontend from the backend (express.static on frontend/)
        so the app is single-origin (see topology note above)
      - Generate a NEW production JWT_SECRET (≥64 random chars; never
        reuse the dev secret)
      - Confirm host runs Node >=18 (bcrypt is a native module, compiled
        on the host at install)
      - Bump cache-bust version: node scripts/bust-cache.js

    Module 7.2 — Provision the database (MySQL host)
      - Create a managed MySQL 8 instance. MUST be MySQL — Supabase
        (PostgreSQL) is NOT compatible with this app (mysql2 + MySQL-only
        SQL such as CONVERT_TZ). Options: Railway MySQL (co-located with
        the backend = lowest latency, single provider), Aiven for MySQL,
        or AWS RDS MySQL.
      - Load database/schema.sql ONCE (fresh install). It is self-sufficient
        — it creates app_settings and its singleton row via INSERT IGNORE.
      - Do NOT load seed.sql in production (it is demo data).
      - Create the least-privilege app user (SELECT/INSERT/UPDATE on the
        app DB only; no DDL — schema/migrations are run by a privileged user).
      - The migrate_*.sql files are only for UPGRADING an existing database,
        not for a fresh install.
      - Verify whether MySQL named-timezone tables are loaded; expect the
        offset fallback on hosts that lack them (logged on boot — see
        Timezone note below).

    Module 7.3 — Deploy the app (single Node service)
      - Push the backend (now also serving the frontend) to Railway/Render
      - Enable automatic HTTPS and attach the custom domain
      - Configure the platform health check to GET /api/health

    Module 7.4 — Production environment variables
      - Required (server fails fast if any are missing): JWT_SECRET,
        DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, GROQ_API_KEY
      - FRONTEND_URL = the production origin (used for CORS; extend with the
        Capacitor origin in Phase 8). With single-origin web, same-origin
        requests don't need it, but set it correctly anyway.
      - Set every secret as a platform env var — never commit .env

    Module 7.5 — First-run setup
      - Owner registers via the register page. Under Phase 6.5 EVERY signup
        creates its own ISOLATED store and the signer is that store's
        owner-admin (a 14-day no-card Basic trial starts automatically). There is
        no "first account is admin, rest are cashiers" rule anymore — cashiers
        are sub-accounts the owner adds later on the Team page. Admins can
        restock, use Finance, delete products, and change settings; cashiers are
        limited to New Order + Sales History. No manual DB role change is needed.
      - In Account Settings: set store name + address (saved to the store row via
        PUT /api/settings/store-info) and the store timezone

    Module 7.6 — Backups & recovery (financial data — non-negotiable)
      - Enable automated daily database backups on the MySQL host
      - Perform ONE test restore BEFORE go-live to prove backups work

    Module 7.7 — Monitoring & logging
      - Uptime monitor pinging GET /api/health
      - Confirm the platform captures morgan's stdout request logs
      - NOTE: the auth/inventory rate limiters and the AI per-user limiter
        are IN-MEMORY. Run a SINGLE backend instance — do not horizontally
        autoscale yet, or limits/counters fragment across instances.

    Module 7.8 — Go-live verification
      - Run backend/test-integration.js against the deployed stack
      - Walk the critical path manually: register → promote admin →
        add product → restock → sale → receipt → history → finance entry →
        Os chat
      - Confirm HTTPS, CORS behavior, and a known rollback path

  TIMEZONE MIGRATION (run once when upgrading an existing database):
    Order: stop API → back up DB → run database/migrate_timezone.sql →
    deploy backend (connection now pins UTC) → start API. The migration
    shifts existing Manila-local DATETIMEs to UTC (idempotent, guarded by
    schema_migrations) and creates the app_settings row.
    Named-zone CONVERT_TZ needs MySQL's timezone tables loaded — present on
    AWS RDS / Railway / Render, NOT on PlanetScale. The backend detects this
    on boot and falls back to a fixed offset when they're absent (logged as
    "[TZ] ... offset fallback").
    (Fresh installs skip this entirely — schema.sql already stores UTC and
    seeds the app_settings row.)

  ──────────────────────────────────────────────────────────────
  PHASE 8: MOBILE APP DEPLOYMENT (Android, cloud)
  ──────────────────────────────────────────────────────────────

  SCOPE:
    A "cloud" Android app: the existing web frontend wrapped natively and
    talking to the SAME Phase 7 backend over HTTPS. No rewrite, no second
    codebase. True offline operation (local DB + sync) is explicitly OUT of
    scope here — see the Phase 9 note at the end.

  KEY PREREQUISITE (the thing that breaks if missed):
    Inside a Capacitor app the page origin is capacitor://localhost (Android),
    NOT the backend. So `window.location.origin + '/api'` resolves to the
    device, not the server. The packaged build MUST point api.js at the real
    backend URL, and the backend CORS (FRONTEND_URL) MUST allow the Capacitor
    origin. The web build keeps its same-origin behavior unchanged.

  MODULES:
    Module 8.1 — PWA foundation (also makes the web app installable + faster)
      - Add manifest.json (name, icons, theme color, display: standalone)
      - Add a service worker that caches the app shell (HTML/CSS/JS) for
        instant repeat loads and resilience to flaky signal
      - Verify "Add to Home Screen" works from the mobile browser

    Module 8.2 — Configurable API base URL
      - Replace the same-origin assumption with a configured backend URL for
        packaged builds (build-time constant / env), keeping the web build
        on same-origin
      - Add the Capacitor origin to the backend FRONTEND_URL (CORS allowlist)

    Module 8.3 — Capacitor wrap (Windows-only; no Mac needed for Android)
      - Install Capacitor, init the project, add the Android platform
      - Install Android Studio + JDK + Android SDK on Windows

    Module 8.4 — App identity
      - App icon, splash screen, package name (e.g. com.<you>.celsopos),
        and display name (reuse store branding)

    Module 8.5 — Native behavior pass
      - Hardware back button handling, status-bar / safe-area insets,
        no-signal / network-error UX, open external links in the system
        browser, optional keep-awake on the POS screen

    Module 8.6 — Signed release build
      - Generate a release keystore and BACK IT UP (losing it blocks all
        future updates to the listing)
      - Build the signed AAB/APK

    Module 8.7 — Google Play Console
      - One-time $25 developer account
      - Store listing + screenshots
      - Privacy policy URL + Data Safety form (the app handles business
        financial data and sends aggregates to an AI provider — disclose it)

    Module 8.8 — Release rollout
      - Internal testing → closed testing → production track
      - Verify the installed app reaches the Phase 7 backend over HTTPS

  PHASE 9 NOTE (deferred — do NOT bundle into Phase 8):
    True offline-first — local SQLite mirror of products/stock, a local
    sale queue, and a sync engine with an explicit stock-conflict policy —
    is its own project. It conflicts with the current server-authoritative
    price/stock enforcement, so scope it separately once real usage confirms
    connectivity is the blocker.

================================================================
[11. DEPENDENCIES]
================================================================

  PRODUCTION
    express              ^5.2.1    Web framework
    mysql2               ^3.22.3   MySQL driver (promise-based)
    bcrypt               ^6.0.0    Password hashing
    jsonwebtoken         ^9.0.3    JWT generation and verification
    cors                 ^2.8.6    Cross-origin resource sharing
    dotenv               ^17.4.2   Environment variable loader
    express-rate-limit   ^8.5.2    Request rate limiting
    helmet               ^8.1.0    OWASP HTTP security headers
    morgan               ^1.10.1   HTTP request logger

  DEVELOPMENT
    nodemon              ^3.1.14   Auto-restart server on file changes

  NODE REQUIREMENT: >= 18.0.0

================================================================
  END OF DOCUMENT — Version 8.1
  Phase 4 AI · Phase 5 Finance · Phase 6 Onboarding — COMPLETE
  Phase 6.5 Multi-Tenant SaaS (tenancy + RBAC + Team) — COMPLETE
  Phase 6.6 Manual GCash billing bridge (4 PHP tiers, verify-first claims,
    super-admin approval; PayMongo later) — COMPLETE (6.6a–h); test-tenancy 57/57
    green. Pending only live GCash payment validation (set QR in the operator
    console). DEPLOY NOTE: after running migrate_billing_bridge.sql, RESTART the
    API server — pooled DB connections cache the old plan enum and 500 on 'basic'
    inserts until reconnected.
  Post-ship:
    • Sales — Admin sale-edit (PUT /api/sales/:id): edit a past sale from
                   History with full server-side reconciliation (stock
                   delta + inventory_adjustments + recomputed header +
                   re-amounted sales_revenue cash movement). Edit UI lives
                   in the View/receipt modal (qty steppers, remove, tax
                   toggle, live totals, double-submit guard). History table
                   hides when empty; all cells HTML-escaped.
    • Timezone infrastructure — store-wide timezone setting (app_settings),
                   all timestamps stored UTC, day-bucketing & display in the
                   store timezone via CONVERT_TZ (named-zone with offset
                   fallback). Set during onboarding (admin) and changeable in
                   Account Settings. Past records are never rewritten — only
                   how days are bucketed/displayed changes. New /api/settings
                   endpoints; migrate_timezone.sql for existing databases.
    • Module 4.7 — Docked Os widget (Messenger-style overlay +
                   mobile bottom sheet); chat client split into a
                   pure-JS module (os.client.js) so the upcoming
                   mobile app can share the same chat semantics
    • Module 6.9 — Tour Preview Injection (illustrative example
                   data during onboarding tours, clean rollback)
    • Module 6.5 — Finance tour added (5 tours total)
    • Module 6.3 — Restart Onboarding button in Account Settings
    • Analytics — Two-tier dashboard:
                  Tier 1 (all users): 8 KPI cards with period-over-
                  period deltas, Gross Profit + Profit Margin KPIs,
                  Health Badge (Healthy / Steady / Watch / Warning
                  computed from revenue + margin trends), always-
                  visible 12-month heatmap, Revenue / Top Products /
                  Day-of-Week charts, Last Month preset replacing
                  the prior Last 30 Days button.
                  Tier 2 (Advanced Analytics toggle, off by default,
                  BETA badge): Monthly Revenue Goal with inline
                  editor (set + clear goal without leaving the page)
                  and a server-side end-of-month projection via
                  /api/analytics/projection (trailing-30-day daily
                  avg × days remaining). Zero DB schema changes.
    • QA fixes — accessibility, step counts, celebration modal,
                 finance.html CSS link
    • Products — Archive & restore: deleted products (already soft-deleted)
                   are now recoverable. A new "Archived" view on the Products
                   page (GET /api/products/archived) lists them with a Restore
                   action (POST /api/products/:id/restore) that un-archives the
                   item on its original id, keeping all sale history. Re-adding a
                   name that matches an archived item returns 409 archivedMatch
                   and prompts "Restore (keep history) vs Add as new" instead of
                   silently creating a duplicate — which would split a product's
                   history across two ids and drop the old half from
                   profit-by-product (filters is_active = 1). allowDuplicate
                   overrides to create a separate item; restore-from-re-add also
                   refreshes pricing to the freshly-typed values.
    • Inventory MVP — restock is quantity-only; the Phase 5 restock
                 cost-capture UI ("Binili ko ito / may gastos") was
                 removed. Money spent on stock is recorded manually as a
                 withdrawal on the Finance page, keeping money-out single-
                 entry (the backend cost params remain, reserved for a
                 future dedicated inventory module). Also: a "+ New product"
                 header link to Products, client-side whole-number quantity
                 validation, XSS-escaped product name/category/unit, and the
                 Low Stock summary count aligned with the table status dots
                 (inclusive threshold).
    • Search UX — All four filter search boxes (Products, Inventory,
                 New Order/POS, History receipt #) clear with the ESC key
                 and a tappable "X" button that appears once the field has
                 text — touch-friendly for the mobile/tablet majority.
                 Clearing keeps focus for fast retyping. Shared
                 .search-field / .search-clear styles live in components.css
                 (the POS reuses .search-clear inside its own
                 .pos-search-wrapper). The POS Enter-to-add / barcode-scanner
                 hook is preserved, and its ESC clear is scoped so it never
                 closes an open payment numpad.
    • Store branding — the Store Name (Account → Store Info) now drives the
                 sidebar brand on desktop and mobile, falling back to
                 "Celso POS" when blank; the mobile navLabel "brand" option
                 maps to it. Name capped at 21 chars, address at 80. A long
                 name wraps to a smaller two-line label on desktop (toggled by
                 measuring real overflow) instead of truncating; rendered via
                 textContent so a user-set name can't inject markup on the
                 shared device.
    • Restock modal — the validation error line is now reserved (and visible:
                 it was display:none, so messages never showed) so a failed
                 entry no longer shifts the Add Stock button, which also gained
                 spacing from the quantity field.
================================================================
