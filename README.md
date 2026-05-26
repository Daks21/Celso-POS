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
  ├── database/                ← SQL schema and seed data (Phase 3 COMPLETE)
  ├── ai/                      ← AI assistant (Phase 4 COMPLETE)
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
  │   │                           button on every page, toggles OsWidget,
  │   │                           rewires sidebar "Os AI" link to open panel
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
  │       └── account.js       ← Account dropdown, settings, tax rate
  │
  └── assets/
      ├── images/              ← Logos, product placeholder images
      ├── icons/               ← UI icons (SVG or PNG)
      └── fonts/               ← Custom fonts if needed

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
  │   └── ai.controller.js     ← Phase 4 COMPLETE (6 endpoints: chat,
  │                               stream, summary, restock, forecast, profit)
  │
  ├── models/                  ← MySQL query functions (no in-memory state)
  │   ├── user.model.js        ← Users table: findByEmail, findById,
  │   │                           create (bcrypt hashing)
  │   ├── product.model.js     ← Products table: CRUD, soft-delete,
  │   │                           search/filter, stock management
  │   ├── sale.model.js        ← Sales + analytics: atomic create(),
  │   │                           getHistory(), getById(), summary,
  │   │                           heatmap, kpis, charts aggregations
  │   └── cashflow.model.js    ← cash_movements CRUD, monthly summary
  │                               (in/out/net), utang balance derivation
  │
  ├── middleware/
  │   ├── auth.middleware.js   ← JWT verification + admin role check
  │   └── error.middleware.js  ← Global error handler
  │                               ({ success: false, message })
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
  └── seed.sql                 ← Sample products, users, and sales data

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

  TABLE: users
  ─────────────────────────────────────────────────────────────
    id          INT           PK, AUTO_INCREMENT
    full_name   VARCHAR       NOT NULL
    email       VARCHAR       UNIQUE, NOT NULL
    password    VARCHAR       bcrypt hash, NOT NULL
    role        VARCHAR       'admin' | 'cashier' (default: cashier)
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    updated_at  TIMESTAMP     AUTO UPDATE

  TABLE: products
  ─────────────────────────────────────────────────────────────
    id          INT           PK, AUTO_INCREMENT
    name        VARCHAR(100)  NOT NULL
    category    VARCHAR       NOT NULL
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
    tax_rate    DECIMAL(5,2)
    cart_tax_on TINYINT(1)    0 = tax per unit | 1 = tax on cart total
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
    amount       DECIMAL(10,2) Always positive; direction implied by type
    description  TEXT          Notes — lender name on borrowed capital,
                               purpose on owner_draw, free-form otherwise
    occurred_at  DATE          When the movement actually happened
    source       VARCHAR       'manual' | 'restock' (auto-created entries)
    source_id    INT           FK to inventory_adjustments.id (nullable)
    recorded_by  INT           FK → users.id
    is_active    TINYINT(1)    Soft-delete flag (default: 1)
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP

  DERIVED VIEWS (computed, not stored):
    Money In   = SUM(amount WHERE type='capital_in')
                 + SUM(sales.total in period)
    Money Out  = SUM(amount WHERE type IN ('owner_draw','opex','capex'))
    Net        = Money In − Money Out
    Utang      = SUM(amount WHERE type='capital_in'  AND category='borrowed')
               − SUM(amount WHERE type='owner_draw' AND category='debt_payment')

  SCHEMA ALTERATIONS (Phase 5):
  ─────────────────────────────────────────────────────────────
    inventory_adjustments:
      + unit_cost       DECIMAL(10,2) NULL   cost per unit at restock time
      + total_paid      DECIMAL(10,2) NULL   total paid to supplier
      + payment_method  ENUM('cash','bank','credit') NULL
      + supplier_name   VARCHAR(100) NULL
    On restock with total_paid > 0, a corresponding cash_movements row
    is auto-created (type='opex', category='restock', source='restock',
    source_id=inventory_adjustments.id).

    products:
      Product creation now enforces initial stock = 0. All stock entry
      flows through the inventory restock modal, ensuring exactly one
      cost-capture point.

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

  ──────────────────────────────────────────────────────────────
  AUTHENTICATION  /api/auth
  ──────────────────────────────────────────────────────────────

    POST   /register       Public (rate-limited)
      Body: { fullName, email, password }
      → 201 { success, message }
      → 400 validation error | 409 email already exists

    POST   /login          Public (rate-limited)
      Body: { email, password }
      → 200 { success, token, user: { id, fullName, email, role } }
      → 401 invalid credentials

    GET    /me             Auth required
      → 200 { success, user: { id, fullName, email, role } }

  ──────────────────────────────────────────────────────────────
  PRODUCTS  /api/products
  ──────────────────────────────────────────────────────────────

    GET    /               Public
      Query: ?search=<string>&category=<string>
      → 200 { success, data: Product[] }
      Returns only active products, sorted A→Z

    GET    /:id            Public
      → 200 { success, data: Product }
      → 404 not found

    POST   /               Auth required
      Body: { name, category, price, cost, unit }
      Initial stock is always 0 — stock is added exclusively via the
      restock endpoint (POST /api/inventory/:productId/adjust) so that
      cost capture has a single funnel into cash_movements (Phase 5).
      → 201 { success, data: Product }
      → 400 validation error

    PUT    /:id            Auth required
      Body: Same as POST (full update)
      → 200 { success, data: Product }

    DELETE /:id            Auth required
      Soft delete (sets is_active = 0, data is preserved)
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

  ──────────────────────────────────────────────────────────────
  INVENTORY  /api/inventory
  ──────────────────────────────────────────────────────────────

    GET    /               Auth required
      → 200 { success, data: [{ id, name, stock, unit,
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

      Phase 5 cost capture (restock only):
        If recordExpense === true (default for restock when totalPaid > 0),
        the inventory_adjustment is persisted with unit_cost, total_paid,
        payment_method, supplier_name — and a cash_movements row is
        atomically created (type='opex', category='restock',
        source='restock', source_id=adjustment.id).
        If recordExpense === false, stock is added without any expense
        entry (for free / leftover / gifted stock).

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
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: current month)
      → 200 { success, data: {
                moneyIn, moneyOut, net, debtBalance,
                byType: { capital_in, owner_draw, opex, capex, sales_revenue },
                byCategory: { <category>: <total>, ... }
              } }
      debtBalance = SUM(capital_in WHERE category='borrowed')
                  − SUM(owner_draw WHERE category='debt_payment')
      (period-independent — reflects current outstanding balance)

    POST   /               Auth required
      Body: { type, category, amount, description?, occurred_at }
      type: 'capital_in' | 'owner_draw' | 'opex' | 'capex'
      category: validated against type-specific allowed values
      occurred_at: YYYY-MM-DD format (validated server-side)
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
  HEALTH CHECK  /api/health
  ──────────────────────────────────────────────────────────────

    GET    /api/health     Public
      → 200 { success, message, db: "Connected — N products" }

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

    4. express.json({ limit })   JSON body parser, capped at 10 KB
                                 (protects against oversized payload DoS)

    5. authLimiter               Rate limit on /api/auth/login and
                                 /api/auth/register: 20 req / 15 min

    6. adjustLimiter             Rate limit on /api/inventory:
                                 60 req / 15 min

    7. authMiddleware            Validates Bearer token from Authorization
                                 header; attaches req.user (id, role, etc.)

    8. adminMiddleware           Checks req.user.role === 'admin';
                                 returns 403 if not (admin-only routes only)

    9. errorMiddleware           Global error handler (last in chain)
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

  AI Provider (Phase 4 — required when AI module is enabled):

    GROQ_API_KEY       Groq API key (primary AI provider)
                       Free at console.groq.com — no billing required
    AI_CACHE_TTL_SEC   300      Cache TTL for AI responses in seconds
    AI_MAX_TOKENS      600      Token budget cap per AI request

  Example .env file:

    JWT_SECRET=<128-char random string>
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=celsopos_app
    DB_PASS=your_db_password
    DB_NAME=celsopos_db
    PORT=3000
    FRONTEND_URL=http://localhost:5173
    GROQ_API_KEY=gsk_your_groq_api_key_here

================================================================
[8. SECURITY]
================================================================

  PASSWORD HASHING
    bcrypt with 10 salt rounds. Plaintext passwords are never stored.

  JWT AUTHENTICATION
    Signed with a 128-character cryptographically random JWT_SECRET.
    Token expiry: 7 days. Role (admin/cashier) embedded in payload.

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

  CORS RESTRICTION
    Only the configured FRONTEND_URL origin is allowed. All other
    origins are rejected.

  REQUEST BODY SIZE LIMIT
    JSON body capped at 10 KB. Oversized requests are rejected before
    reaching application logic.

  GRACEFUL SHUTDOWN
    SIGINT and SIGTERM signals close the HTTP server and drain the
    database connection pool cleanly before the process exits.

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
      - Stock color coding (ok / low / out)
      - Summary stats row
      - Note (Phase 5): "stock" field is hidden on the create form —
        new products always start with stock = 0. All stock entry
        flows through the Inventory restock modal so the Phase 5
        cost-capture funnel stays single-source.

    Module 1.5 — Inventory Page
      - Inventory table with status filters
      - Per-product restock modal
      - Stock status summary (total, ok, low, out)
      - Note (Phase 5): the restock modal gains a "Binili ko ito
        (may gastos)" checkbox. When checked, the modal reveals
        Amount paid, Supplier, and Payment method fields, and the
        backend atomically creates a cash_movements row alongside
        the inventory_adjustment. When unchecked, stock is added
        with no expense entry (free / leftover / gifted stock).

    Module 1.6 — POS / Sales Interface (order.html)
      - Two-panel layout: product grid + cart
      - Category pill filters (collapses to dropdown on mobile)
      - Cart with quantity controls, tax toggle
      - Payment input with live change calculation
      - Stock deduction on checkout

    Module 1.7 — Sales History Page
      - Filter by date range and payment method
      - Search by product or receipt number
      - Sale detail modal with full breakdown
      - Receipt reprint from history

    Module 1.8 — Receipt Generation
      - Shared receipt modal (used on POS and History)
      - Receipt number, date, cashier, itemized table
      - Subtotal, tax, total, payment, change
      - Browser print support

    Module 1.9 — Account Settings & Dropdown
      - Sidebar user card with popup dropdown
      - Account settings page: profile info, theme toggle,
        tax rate selector, customizable stock status colors
      - Dashboard row count controls: separate selectors for
        Low Stock Alerts rows and Recent Transactions rows
      - Items popover toggle: show or hide the transaction detail
        popover on the dashboard Recent Transactions table
      - Advanced Analytics toggle (off by default): unlocks the
        Tier 2 section on the Analytics page (monthly revenue goal,
        cashflow snapshot, inventory health, CSV + PDF export)
      - Monthly revenue goal: optional numeric target used by the
        Tier 2 goal-tracking card on Analytics
      - Settings sync to the backend database — persist across
        devices and sessions (localStorage is a cache only)

    Module 1.10 — Sales Reports Page (Scaffolded)
      - sales.html placeholder page with full app shell
      - "Coming soon" UI for future financial reports/analysis
      - Auth guard applied (checkAuth); ready for Phase 2+ data

  CROSS-CUTTING FEATURES (built across modules):

    Dark / Light Theme
      - Instant toggle via topbar button or account settings
      - Persists across sessions (localStorage)
      - Applied before page paint to prevent flash

    Analytics Page
      - Date range presets: Today, This Week, This Month, etc.
      - Custom date range picker
      - KPI cards: revenue, orders, avg order value, units sold
      - Revenue trend chart, top products, category breakdown
      - Sales activity heatmap (GitHub-style)
      - Pinnable charts to dashboard via toggle

    Dashboard Analytics Section
      - Mini charts pinned from Analytics page
      - Compact heatmap
      - Link to full Analytics page

    Mobile Design
      - Responsive at five breakpoints: 1000px (POS stacks),
        800px (product grid compacts), 768px (primary mobile
        breakpoint), 600px (reduced padding)
      - At ≤768px: sidebar hidden; hamburger menu appears in
        topbar and opens a slide-down nav panel with all six
        main pages; panel closes on navigation or outside tap
      - Mobile topbar shows the store logo; tapping it navigates
        to the POS (order) page
      - Floating Action Button (FAB) on all non-POS pages for
        one-tap access to New Order
      - POS product grid: 4–6 columns on desktop → 2 columns on
        mobile; category pills collapse to a select dropdown
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
      - JWT token issued on login (signed with secret, 7-day expiry)
      - authMiddleware verifies token and attaches user to req
      - Replaced all localStorage-based auth from Phase 1

    Module 2.3 — Products API (CRUD)
      - 5 endpoints: GET /api/products, GET /:id, POST, PUT /:id,
        DELETE /:id
      - Server-side input validation on all write operations
      - JWT-protected writes; query-based filtering on reads
      - Note (Phase 5): POST body no longer accepts a "stock" field.
        New products are created with stock = 0; the controller
        forces this regardless of any client-supplied value.

    Module 2.4 — Sales API (Create + History)
      - POST /api/sales: atomic two-phase commit — validates stock
        and price server-side before recording sale and deducting stock
      - GET /api/sales: history with date-range filtering
      - GET /api/sales/summary: today's revenue, orders, top products
      - All endpoints JWT-protected

    Module 2.5 — Analytics API
      - 6 aggregation functions in sale.model.js
      - GET /api/analytics/summary: revenue, orders, avg order, units
      - GET /api/analytics/heatmap: daily activity grid (GitHub-style)
      - GET /api/analytics/kpis: KPI cards with period comparison
      - GET /api/analytics/charts: revenue trend + category breakdown
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
        is auto-created in the same transaction as the adjustment.

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
      - seed.sql: sample users (admin + cashier), 20 products,
        and sales history for testing
      - Note (Phase 5): seed.sql will be extended with sample
        cash_movements (one borrowed capital_in injection, a few
        opex entries, a couple of owner_draw withdrawals) so demos
        show the Finance page populated with realistic data.

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
      - Os AI nav link in all page sidebars (between Analytics and History)
      - Note (Module 4.7): the FAB now toggles a docked chat panel instead
        of navigating. The sidebar "Os AI" link does the same. Full View
        (ai.html) remains as a focused deep-link mode.

    Module 4.6 — Onboarding Tour + Dashboard Widgets       [COMPLETE]
      - Role-aware onboarding: 4-step admin tour, 3-step cashier tour
      - Tour runs automatically on first Os enable; re-triggerable via chat
      - Os Daily Brief card on Dashboard: urgency-colored dot + summary + tip
        (auto-loads when osEnabled; hidden otherwise)
      - Os Restock Advisor widget on Inventory page: AI-ranked priority list
        (urgent / soon / monitor), loaded when osEnabled

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
        os.js         ← bootstrapper. Mounts the FAB, wires the sidebar
                        "Os AI" link to OsWidget.toggle(), hides itself
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
        - FAB click → OsWidget.toggle(); sidebar "Os AI" link does the
          same on plain click but still navigates to Full View on
          Ctrl/Cmd/Shift/middle-click (open in new tab still works)
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
    - Add Entry modal: type-aware subcategory selectors
      (5 fields max, sub-10-second entry)
    - Sales auto-log as sales_revenue (source='sale') so revenue
      appears inline with cashflow without double entry
    - Restocks auto-log as opex (type='opex', category='restock',
      source='restock') so the owner sees full money-out picture
      without double entry
    - Product creation locked to initial stock = 0 — all stock entry
      flows through the restock modal, ensuring exactly one
      cost-capture point in the system

  REAL-WORLD CONTEXT (why this scope matters):
    PH MSME owners often borrow their starting capital from microfinance
    (CARD MRI, ASA), cooperatives, 5-6 lenders, family, or pawn shops.
    Withdrawals are frequently loan-servicing, not personal spending.
    Subcategorizing capital_in (own vs borrowed) and owner_draw
    (personal vs loan_payment vs reinvest) lets the app compute a
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
    New table: cash_movements (id, type, category, amount, description,
                               occurred_at, source, source_id,
                               recorded_by, is_active, created_at)
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
      - Top row: two summary cards
          ┌──────────────────────┐ ┌────────────────────────┐
          │  Net Balance (total) │ │  Cash Flow (sparkline) │
          └──────────────────────┘ └────────────────────────┘
        Net Balance: all-time running net (Money In − Money Out)
        Cash Flow sparkline: live SVG line chart, auto-adapts
        granularity (daily → weekly → monthly → annually) based
        on card width via ResizeObserver; no external dependencies
      - Filter dropdown: [All Types] [Daily Sales] [Capital In]
        [Withdrawal] — filters table rows; summary always shows totals
      - Cash flow list (date, type + category, signed amount, notes)
        paginated at 20 rows; daily sales grouped into single rows
      - "+ Add Entry" button (admin only) → modal:
          • Type selector: Capital In | Withdrawal
          • Category selector swaps based on type
          • Amount, Date, Notes
      - Auto-created entries (restock, sale) shown read-only;
        manual entries show Edit / Delete kebab menu (admin only)
      - Pagination: 20 entries per page, shared pagination component

    Module 5.4 — Restock Integration + Product Creation Lock [COMPLETE]
      - inventory_adjustments schema extended with unit_cost,
        total_paid, payment_method, supplier_name columns
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
  PHASE 7: DEPLOYMENT
  ──────────────────────────────────────────────────────────────

  MODULES:
    Module 7.1 — Deploy Frontend (Vercel or Netlify)
    Module 7.2 — Deploy Backend (Railway or Render)
    Module 7.3 — Deploy Database (Supabase or PlanetScale)
    Module 7.4 — Set environment variables in production
    Module 7.5 — Final testing and go-live

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
  END OF DOCUMENT — Version 7.2
  Phase 4 AI COMPLETE | Phase 5 Finance COMPLETE | Phase 6 Onboarding COMPLETE
  Post-ship:
    • Module 4.7 — Docked Os widget (Messenger-style overlay +
                   mobile bottom sheet); chat client split into a
                   pure-JS module (os.client.js) so the upcoming
                   mobile app can share the same chat semantics
    • Module 6.9 — Tour Preview Injection (illustrative example
                   data during onboarding tours, clean rollback)
    • Module 6.5 — Finance tour added (5 tours total)
    • Module 6.3 — Restart Onboarding button in Account Settings
    • Analytics — Two-tier dashboard: Tier 1 ships period-over-
                  period deltas, gross profit / margin, Health
                  Badge, and collapsible heatmap to all users;
                  Tier 2 (off-by-default Advanced Analytics
                  toggle) adds monthly revenue goal, cashflow
                  snapshot, inventory health, CSV + PDF export.
                  Backed by /api/analytics/profit and
                  /api/analytics/inventory-health, plus prior-
                  window comparison on /api/analytics/kpis.
                  Zero DB schema changes.
    • QA fixes — accessibility, step counts, celebration modal,
                 finance.html CSS link
================================================================
