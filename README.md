================================================================
  Celso POS v3.1
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
    - Eventually: AI assistant for smart recommendations

  TARGET USERS  :
    - Sari-sari store owners
    - Small retail shop owners
    - MSMEs with no technical background
    - Anyone needing a simple POS without expensive software

  WHAT MAKES IT DIFFERENT:
    - Built specifically for Filipino MSME needs
    - Simple UI, no overwhelming features
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
  │  LAYER 3: DATABASE │  │  LAYER 4: AI (FUTURE) │
  │  Stores all data   │  │  Reads data, gives    │
  │  permanently       │  │  smart suggestions    │
  │  Tech: MySQL 8     │  │  Tech: Claude API     │
  └────────────────────┘  └───────────────────────┘

  HOW THEY CONNECT:
    1. User opens browser → sees FRONTEND
    2. User clicks "Add Sale" → FRONTEND sends request to BACKEND
    3. BACKEND validates the request and writes to DATABASE
    4. DATABASE confirms → BACKEND responds to FRONTEND
    5. FRONTEND updates what the user sees
    6. (Future) BACKEND fetches data → sends to AI → returns insight

  ANALOGY:
    Think of it like a restaurant:
    - Frontend   = Dining area (what customers see)
    - Backend    = Kitchen (where the cooking/logic happens)
    - Database   = Storage/pantry (where ingredients are kept)
    - AI Layer   = Head chef advisor (reads everything, gives tips)

  COMMUNICATION FORMAT:
    - Frontend ↔ Backend : JSON over HTTP (REST API)
    - Backend  ↔ Database: SQL queries via mysql2 (prepared statements)
    - Backend  ↔ AI      : API calls with structured data

================================================================
[3. PROJECT STRUCTURE]
================================================================

  STRATEGY: Frontend First, then Backend, then Database, then AI.
  All code lives in ONE root folder: Celso_POS/

  ROOT FOLDER LAYOUT:
  ─────────────────────────────────────────────────────────────
  Celso_POS/
  │
  ├── frontend/                ← Everything the user sees
  ├── backend/                 ← Server, routes, logic (Phase 2+3 COMPLETE)
  ├── database/                ← SQL schema and seed data (Phase 3 COMPLETE)
  ├── ai/                      ← AI assistant (Phase 4)
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
  │   ├── sales.html           ← Sales reports page (placeholder)
  │   └── account.html         ← User profile + app settings
  │
  ├── css/
  │   ├── main.css             ← Variables, reset, typography,
  │   │                           animations, login/register styles
  │   ├── layout.css           ← App shell: sidebar, topbar, page body
  │   ├── components.css       ← Shared components: tables, badges,
  │   │                           buttons, inputs, modals, receipt
  │   └── pages/               ← Page-specific styles (one per page)
  │       ├── dashboard.css
  │       ├── products.css
  │       ├── inventory.css
  │       ├── order.css
  │       ├── history.css
  │       ├── analytics.css
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
  │   │   ├── sidebar.js       ← Active nav link, user initials
  │   │   └── receipt.js       ← Shared receipt modal logic
  │   │
  │   └── pages/               ← One script per page
  │       ├── dashboard.js     ← Summary stats, charts, heatmap
  │       ├── products.js      ← Product CRUD, modal, search
  │       ├── inventory.js     ← Stock table, filters, restock
  │       ├── order.js         ← POS cart, category pills, checkout
  │       ├── history.js       ← Sales filter, detail modal
  │       ├── analytics.js     ← KPI cards, Chart.js charts, date range
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
  │   └── analytics.routes.js  ← /api/analytics (summary, heatmap,
  │                               kpis, charts — JWT-protected)
  │
  ├── controllers/             ← Business logic for each feature
  │   ├── auth.controller.js
  │   ├── products.controller.js
  │   ├── sales.controller.js
  │   ├── inventory.controller.js
  │   └── analytics.controller.js
  │
  ├── models/                  ← MySQL query functions (no in-memory state)
  │   ├── user.model.js        ← Users table: findByEmail, findById,
  │   │                           create (bcrypt hashing)
  │   ├── product.model.js     ← Products table: CRUD, soft-delete,
  │   │                           search/filter, stock management
  │   └── sale.model.js        ← Sales + analytics: atomic create(),
  │                               getHistory(), getById(), summary,
  │                               heatmap, kpis, charts aggregations
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
  ├── schema.sql               ← 5-table relational schema with indexes
  │                               and foreign keys
  └── seed.sql                 ← Sample products, users, and sales data

  ─────────────────────────────────────────────────────────────

  ai/                          ← Phase 4 (not yet built)
  │
  └── assistant.js             ← Claude API integration logic

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

  INDEXES: users.email (UNIQUE), products.name, products.category,
           sales.created_at, sales.cashier_id, sale_items.sale_id,
           sale_items.product_id, inventory_adjustments.product_id,
           inventory_adjustments.created_at

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
      Body: { name, category, price, cost, stock, unit }
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
      Body: { quantity, type, notes? }
      type: restock | adjustment | damage | return
      restock/return → adds stock | damage/adjustment → removes
      Stock never goes below 0.
      → 200 { success, data: { product, adjustment } }

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
              avgOrderValue, totalUnits } }

    GET    /charts         Auth required
      Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days)
      → 200 { success, data: { revenueByDay, topByRevenue,
              topByQty, byDayOfWeek } }
      revenueByDay: all dates in range, 0-filled for missing days
      topByRevenue / topByQty: top 5 products each
      byDayOfWeek: array[7] (Sun=0 … Sat=6)

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

  Example .env file:

    JWT_SECRET=<128-char random string>
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=celsopos_app
    DB_PASS=your_db_password
    DB_NAME=celsopos_db
    PORT=3000
    FRONTEND_URL=http://localhost:5173

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

  ATOMIC TRANSACTIONS
    Sale creation is fully atomic (ACID). All-or-nothing: sale header,
    line items, stock deductions, and audit entries either all succeed
    or all roll back.

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

    Frontend → Backend → Database → AI → Deployment

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

    Module 1.5 — Inventory Page
      - Inventory table with status filters
      - Per-product restock modal
      - Stock status summary (total, ok, low, out)

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
      - 5-table relational model: users, products, sales,
        sale_items, inventory_adjustments
      - Foreign keys, indexes, utf8mb4 charset, soft deletes

    Module 3.2 — Create Tables + Seed Data
      - schema.sql: all CREATE TABLE statements with constraints
      - seed.sql: sample users (admin + cashier), 20 products,
        and sales history for testing

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
  PHASE 4: AI INTEGRATION                           [NEXT]
  ──────────────────────────────────────────────────────────────

  MODULES:
    Module 4.1 — Connect to Claude API
    Module 4.2 — Fetch and format database data as AI input
    Module 4.3 — Build a chat-style UI for the assistant
    Module 4.4 — Test and refine prompts

  ──────────────────────────────────────────────────────────────
  PHASE 5: DEPLOYMENT
  ──────────────────────────────────────────────────────────────

  MODULES:
    Module 5.1 — Deploy Frontend (Vercel or Netlify)
    Module 5.2 — Deploy Backend (Railway or Render)
    Module 5.3 — Deploy Database (Supabase or PlanetScale)
    Module 5.4 — Set environment variables in production
    Module 5.5 — Final testing and go-live

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
  END OF DOCUMENT — Version 3.1 (Phase 3 + Enhancements Complete, Phase 4 Next)
================================================================
