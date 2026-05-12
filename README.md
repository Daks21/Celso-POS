================================================================
  Celso POS v2.0
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
  │  Tech: SQL         │  │  Tech: Claude API     │
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
    - Backend  ↔ Database: SQL queries
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
  ├── backend/                 ← Server, routes, logic (Phase 2)
  ├── database/                ← SQL schema and seed data (Phase 3)
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
  │   ├── layout.css           ← App shell: sidebar, topbar,
  │   │                           notification panel, page body
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
  │   │   ├── notifications.js ← Stock-based notification panel
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
    core/data.js → components/notifications.js →
    [components/receipt.js if needed] → pages/[page].js

  Core and component scripts always load before page scripts so
  that functions like formatPeso and checkAuth are available
  globally.

  ─────────────────────────────────────────────────────────────

  backend/                     ← Phase 2 (COMPLETE)
  │
  ├── server.js                ← App entry point. Starts the server.
  ├── .env                     ← JWT secret and port config (not in git)
  ├── routes/                  ← URL endpoints (API paths)
  │   ├── auth.routes.js       ← /api/auth/login, /api/auth/register
  │   ├── products.routes.js   ← /api/products (CRUD)
  │   ├── sales.routes.js      ← /api/sales (create, history, summary)
  │   ├── inventory.routes.js  ← /api/inventory (stock, low-stock,
  │   │                           summary, adjust — admin-protected)
  │   └── analytics.routes.js  ← /api/analytics (summary, heatmap,
  │                               kpis, charts — JWT-protected)
  │
  ├── controllers/             ← Logic for each feature
  │   ├── auth.controller.js
  │   ├── products.controller.js
  │   ├── sales.controller.js
  │   ├── inventory.controller.js
  │   └── analytics.controller.js
  │
  ├── models/                  ← In-memory data stores + query logic
  │   ├── user.model.js        ← Users, bcrypt password hashing
  │   ├── product.model.js     ← Products + stock query/mutation fns
  │   └── sale.model.js        ← Sales records + aggregation fns
  │
  └── middleware/
      ├── auth.middleware.js   ← JWT verification + admin role check
      └── error.middleware.js  ← Catches and formats errors

  ─────────────────────────────────────────────────────────────

  database/                    ← Phase 3 (not yet built)
  │
  ├── schema.sql               ← CREATE TABLE statements
  └── seed.sql                 ← Sample data for testing

  ─────────────────────────────────────────────────────────────

  ai/                          ← Phase 4 (not yet built)
  │
  └── assistant.js             ← Claude API integration logic

  ─────────────────────────────────────────────────────────────

================================================================
[4. DEVELOPMENT ROADMAP]
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
      - Recent sales table
      - Sidebar navigation with active state
      - Topbar with notification bell + theme toggle

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
      - Settings persist to localStorage

    Module 1.10 — Sales Reports Page (Scaffolded)
      - sales.html placeholder page with full app shell
      - "Coming soon" UI for future financial reports/analysis
      - Auth guard applied (checkAuth); ready for Phase 2+ data

  CROSS-CUTTING FEATURES (built across modules):

    Dark / Light Theme
      - Instant toggle via topbar button or account settings
      - Persists across sessions (localStorage)
      - Applied before page paint to prevent flash

    Notifications System
      - Bell icon in topbar with unread badge count
      - Auto-generates alerts from live stock levels
      - Low stock and out-of-stock notifications
      - Dismissable individually or all at once

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
      - GET /api/sales: paginated history with date-range filtering
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
  PHASE 3: DATABASE (SQL)                           [NEXT]
  ──────────────────────────────────────────────────────────────

  MODULES:
    Module 3.1 — Design Database Schema (entity breakdown)
    Module 3.2 — Create Tables (users, products, sales)
    Module 3.3 — Connect Backend to Database
    Module 3.4 — Run SQL through the API
    Module 3.5 — Seed sample data for testing

  ──────────────────────────────────────────────────────────────
  PHASE 4: AI INTEGRATION
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
  END OF DOCUMENT — Version 2.0 (Phase 2 Complete)
================================================================
