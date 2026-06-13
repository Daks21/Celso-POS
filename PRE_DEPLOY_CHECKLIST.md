# Celso POS — Pre-Deploy Smoke & QA Checklist

> **Purpose:** the go/no-go runbook for launch day. Work through it top-to-bottom
> every time you deploy to production — A (verify locally) → B (prod setup, order
> matters) → C (smoke the live URL) → D (known accepted risks). It exists so a
> deploy is a deliberate, repeatable procedure, not a guess: it remembers the
> easy-to-forget, expensive-to-miss steps (e.g. set `TRUST_PROXY`, never run
> `seed.sql` in prod) for a solo operator with no second pair of eyes. Go/no-go
> rule is at the bottom. Keep it in sync when behavior changes, or it quietly
> certifies things it no longer tests. NOT a substitute for the automated suites
> or for proven backups — it points at those.

Right-sized for a first production launch: a **delta + smoke** pass, not a full re-QA.
The whole app was already vetted in the earlier A–E QA; everything new since is Phase
6.7 (password recovery + support tickets) + the show-password/security fixes, all
covered by the green automated suites. Tick through this on deploy day.

Status at last check: `test-recovery` 41/41 · `test-tenancy` 57/57 · `test-integration`
23/23 (all green on current code).

---

## 0. Before you start
- [ ] Working tree committed — `git status` is clean.
- [ ] On the branch you intend to deploy.
- [ ] You have the production DB connection details + a super-admin email/password ready.

## A. Local verification (~20 min) — do this first, with the local server running on :3000
> Reminder: restart `node server.js` after ANY backend edit — Node doesn't hot-reload.

**A1. Automated suites** (from `backend/`, server up):
- [ ] `node test-recovery.js` → 41 passed, 0 failed
- [ ] `node test-tenancy.js` → 57 passed, 0 failed
- [ ] `node test-integration.js` → all passed

**A2. Show-password toggle — visual (M2)** — hard-refresh first (Ctrl+F5):
- [ ] **Login** (`index.html`): eye icon sits inside the password field, toggles show/hide, no text overlap. Check desktop + a phone width (DevTools responsive).
- [ ] **Register**: same on Password + Confirm; the strength meter still shows below.
- [ ] **Change-password**: same on both fields.

**A3. Recovery flow — end-to-end in the browser:**
- [ ] Register a test owner (full name, email, **mobile**, **place of birth**, password).
- [ ] Log out → "Forgot password?" → submit email + mobile + place of birth → see the generic "if that account exists…" message.
- [ ] Log in as the **super-admin** → operator console → the request appears with the scorecard (mobile ✓, place-of-birth ✓, on-file number).
- [ ] Click the row → **Approve** → enter operator password (step-up) → a **12-hex code** appears once.
- [ ] Log in as the owner with that code → it **forces the change-password screen** → set a new password → lands in the dashboard.
- [ ] Account → **Security & Recovery** → change the mobile → it **asks for your current password** before saving.
- [ ] Account → **Report an Issue** → send a ticket → it appears in the operator console, tagged to the store.
- [ ] (Negative) Wrong place-of-birth on a request → operator can **Reject**.

**A4. Critical journeys smoke (the money paths, ~5 min):**
- [ ] Owner login → ring up a **sale** (POS) → receipt prints/shows.
- [ ] **History** shows the sale; **Dashboard** + **Finance** load with correct numbers.
- [ ] Create a **cashier** (Team page, paid plan) → cashier logs in → can reach POS + History, blocked from Finance/Analytics.
- [ ] **Cashier cannot mutate the catalog** via the API: with a cashier token, `POST`/`PUT /api/products` and `POST /api/products/:id/restore` all return **403** (writes are admin-only; the UI hides them, the API is the boundary).
- [ ] **Billing claim self-service:** submit a GCash claim → on the pending screen, **Edit reference** corrects a typo'd ref and **Cancel request** withdraws it; after an operator **rejects** a claim, the Billing page shows the rejection banner + Submit-again CTA.
- [ ] Log out → confirm the session is fully cleared (shared-device wipe).

**A4b. Full-feature smoke (~10 min) — the paths the automated suites DON'T cover by hand.**
> The suites cover sales/products/tenancy/recovery; these features are not asserted there,
> so tick each once so a deploy doesn't *assume* they still work.
- [ ] **Inventory:** restock a product (qty goes up, audit row logged); a damage/return adjustment moves stock the right way and never below 0.
- [ ] **Products:** delete → it appears in **Archived** → **Restore** brings it back on the same id with history intact.
- [ ] **Finance:** add a capital-in and a withdrawal (incl. a borrowed loan with terms) → **Net / Debt / Profit** tiles update; edit + delete a manual entry.
- [ ] **Analytics:** page loads — KPI cards, charts, heatmap, and (Plus) inventory-health + monthly-goal projection all render without errors.
- [ ] **Sale edit:** edit a past sale from History (change a qty / toggle tax) → stock, Finance "Money In", and totals all reconcile.
- [ ] **Os AI (Plus):** enable in Account → FAB appears → ask one question → it streams a reply; a Free store sees the upgrade gate instead.
- [ ] **Super-admin OPERATIONS (not just reachable):** approve a real claim → store activates + seats reconcile; reject one → owner sees the rejection; **Revert** a mistaken approval; upload/replace the GCash QR; review + approve a reset request.
- [ ] **Plan gating:** a Free owner sees locked overlays on Plus pages; an operator-approved upgrade unlocks them **without re-login** (entitlements refresh on next page load).

**A5. Cache-bust before pushing:**
- [ ] `node scripts/bust-cache.js` → commit the `?v=` bumps (so new `icons.js`/`main.css`/pages aren't served stale).

## B. Deploy day — production setup (order matters)
- [ ] Provision the host (Railway) + a MySQL database.
- [ ] **Set up the schema once:** in MySQL Shell, `SOURCE database/schema.sql;` against the **fresh** prod DB. (It includes all phases incl. 6.7 — do NOT run the migrate_*.sql files; those are only for upgrading an already-live DB.)
- [ ] Set environment variables on the host:
  - [ ] `JWT_SECRET` (long, random, ≥64 chars)
  - [ ] `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME`
  - [ ] `GROQ_API_KEY`
  - [ ] `FRONTEND_URL` (your prod origin)
  - [ ] **`TRUST_PROXY=1`** ← required, or the rate limiters bucket all users together
- [ ] Deploy the code (push / trigger build).
- [ ] Seed the operator: `node backend/scripts/create-superadmin.js` against prod (needed to review billing claims AND password-reset requests).
- [ ] (Billing) Upload the GCash receiving QR + name/number in the operator console, if launching paid plans.
- [ ] **Backups (non-negotiable — financial data):** enable automated daily DB backups on the MySQL host, then perform **ONE test restore** into a scratch DB and confirm it loads. Backups you've never restored are not backups. (README Phase 7.6.)

## C. Post-deploy smoke (on the live URL)
- [ ] Site loads over **HTTPS** (Railway provides it); no mixed-content warnings.
- [ ] `GET /api/health` → `{ success: true, db: "Connected" }`.
- [ ] Hard-refresh (Ctrl+F5) — eye icon + bell icon render (no "unknown icon" console warnings).
- [ ] Register → login → one sale → history (the core loop works on prod).
- [ ] One recovery request → operator approve → temp-code login → forced change (the new flow works on prod).
- [ ] Super-admin can reach the operator console; a tenant gets 404 on `/api/admin/*`.

## D. Known deferred items (launch eyes-open — not blockers, but track them)
- [ ] CSP still allows `'unsafe-inline'` for scripts (move inline scripts to files + nonces later).
- [ ] DB TLS — enable once the host's cert/details are settled.
- [ ] Rate limiters are in-memory (per-instance) — fine on a single instance; move to a shared store (Redis) if you scale out.
- [ ] No idle-logout by design (JWT `JWT_EXPIRES_IN`, default short) + full `clearSession` on logout for the shared-device model.
- [ ] Email/SMS recovery is the manual operator bridge (by design); migrate to automated email-token reset once a domain + provider exist.

---

**Go/no-go:** all of A green + B completed + C smoke passes = ship. If you change code
between now and deploy day, re-run section A.
