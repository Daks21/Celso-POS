# Finance Page — Audit & Redesign Plan

Branch: `audit/finance-page`
Audited revision: `main` @ commit prior to this branch creation
Auditor instructions: produce written report only — no code changes.

---

## 1. Executive Summary

**The headline finding is conceptual, not a bug.** The Finance page's primary card, "Net Balance," is `Money In − Money Out` over all-time. This number conflates two questions a sari-sari owner urgently needs answered separately: *"Magkano pera ko ngayon?"* (cash on hand) and *"Kumita ba ako?"* (profit). A ₱20,000 capital injection makes Net Balance jump ₱20,000 even though no profit was earned; a ₱5,000 restock makes Net Balance drop ₱5,000 even though no loss was incurred (inventory replaces cash one-for-one). Two owners with identical Net Balance can be in very different positions — one genuinely profitable, the other being propped up by fresh capital. The page cannot tell them apart. **This is the budget-tracker trap, and it is the single most important thing to fix.**

The supporting findings are smaller but corroborate the same theme: the page over-trusts a single conflated metric, and under-uses data the system already has.

| # | Severity | Finding |
|---|---|---|
| 1 | **Critical** | "Net Balance" conflates cash-on-hand and profit (see above). |
| 2 | **High** | No Profit card on the page, despite `/api/analytics/profit` already implementing realized COGS correctly (`backend/controllers/analytics.controller.js:99`). |
| 3 | **High** | No page-level period selector. All cards are all-time. "Better than last month?" is unanswerable. |
| 4 | **High** | `seed.sql` uses category `loan_payment` for debt repayments, but the debt formula matches `debt_payment` only — seeded payments do **not** reduce the displayed debt balance (`database/seed.sql:35,39` vs `backend/models/cashflow.model.js:127`). |
| 5 | **Medium** | Capex entries display as `+ ₱X` (income) instead of `− ₱X` (outflow) in the cashflow table — sign-detection misses capex (`frontend/js/pages/finance.js:311`). The chart treats it correctly (`finance.js:134`), so chart and table disagree. |
| 6 | **Medium** | Restock auto-entry's `occurred_at` uses MySQL `CURDATE()` (`backend/models/product.model.js:119`) — session-timezone dependent. Sales correctly derive from `DATE(s.created_at)`. Manila stores on a UTC DB will drift restock dates by ~1 day during evening hours. |
| 7 | **Medium** | "Withdrawal" filter maps to `owner_draw` only; business expenses (`opex`, `capex`) are invisible unless **All Types** is selected. Owners cannot easily ask "show me my expenses." |
| 8 | **Medium** | Sparkline's Y-axis (cumulative cash position) is unlabeled. Users cannot tell what the line means. |
| 9 | **Medium** | Empty state is a plain "No entries found." with no CTA — bad first-run UX. |
| 10 | **Low** | README documents the Money In formula as `SUM(capital_in) + SUM(sales.total)` (`README.md:395-396`). The code actually sums `cash_movements WHERE type IN ('capital_in','sales_revenue')` — same value, **no double-count**, but the README is misleading. |
| 11 | **Low** | README:663 documents `/summary` default range as "current month." Actual default when client omits `from`/`to` is **all-time**. Doc bug. |
| 12 | **Low** | No upper-bound or future-date sanity check on POST `/api/finance` amount/`occurred_at`. DECIMAL(10,2) hard-cap at ~₱99M will produce an unfriendly SQL overflow on typos. |
| 13 | **Low** | Page ships 3 summary cards (Net Balance, Debt Balance, Cash Flow chart) but README:1463-1466 shows only 2. Doc out of date. |

**Verification of the most-suspected bug:** the prompt asked that double-counting of sales in Money In be checked first. **It does not exist.** `cashflow.model.js:111-121` sums `cash_movements` once with `type IN ('capital_in','sales_revenue')`; sales atomically create a single `sales_revenue` row in the sale transaction (`sale.model.js:133-138`); the controller never separately queries `sales.total`. Money In is honest. (Details in §4.1 with a reproducible SQL query.)

---

## 2. README Compliance Audit (Part 1)

| Feature documented | Documented (README) | Actual implementation | Status |
|---|---|---|---|
| 2 top cards: Net Balance + Cash Flow sparkline | 2 cards (`README.md:1463-1466`) | **3 cards**: Net Balance, Debt Balance (default-on via `localStorage.financeDebtBalanceVisible`), Cash Flow chart (`finance.js:75-100`) | **Divergent** — implementation richer than docs |
| Filter dropdown: All / Daily Sales / Capital In / Withdrawal | 4 options (`README.md:1471-1472`) | 4 options, matching values (`finance.html:144-150`) | ✅ Match |
| 20-row pagination, daily sales grouped | 20/page, grouped (`README.md:1473-1474`) | `PAGE_SIZE = 20` (`finance.js:24`); `groupSalesRevenue` collapses `sales_revenue` rows per date (`finance.js:233-269`) | ✅ Match |
| Add Entry modal (admin only); type selector Capital In / Withdrawal | (`README.md:1475-1477`) | Modal hidden unless `isAdmin()` shows the button (`finance.js:581-583`); modal type select has exactly Capital In / Withdrawal (`finance.html:191-194`) | ✅ Match |
| Type-aware category selector | (`README.md:1477`) | `populateCategorySelect()` swaps options on type change (`finance.js:402-408, 518-520`) | ✅ Match |
| Auto entries read-only; manual entries get kebab Edit/Delete | (`README.md:1479-1480`) | Frontend: `entry.source !== 'manual'` → renders the text "auto" in actions cell; manual → kebab (`finance.js:330-347`). Backend: controller rejects edit/delete of non-manual (`finance.controller.js:84,122`) **and** the SQL `UPDATE` / soft-delete include `AND source='manual'` (`cashflow.model.js:95,105`). Defense in depth. | ✅ Match |
| Sparkline auto-granularity via ResizeObserver | daily → weekly → monthly → annually (`README.md:1468-1470`) | `getGranularity()` thresholds at 600/350/200 px (`finance.js:108-113`); `ResizeObserver` redraws on width change (`finance.js:225-228`) | ✅ Match |

**Doc bugs to fix in README.md (separate PR):**
- `README.md:395-396` — Money In formula written as `SUM(capital_in) + SUM(sales.total)`; misleading. The actual implementation reads `cash_movements` only and never joins the `sales` table.
- `README.md:663` — claims `/summary` default range is "current month"; actually no default applied — query returns all-time when `from`/`to` omitted.
- `README.md:1463-1466` — claims 2 top cards; ships 3.
- `README.md:1457` and `seed.sql:35,39` — `loan_payment` was renamed to `debt_payment` in the model. Seed file still uses old name. See §4.6.

---

## 3. Conceptual Correctness Audit (Part 2)

### 3.1 What does "Net Balance" actually display?

Trace: `finance.js:75-83` renders the card. The number comes from `data.net`, which is the response of `GET /api/finance/summary` (`finance.js:481-483`). The frontend never sends `from`/`to` — `getFilters()` only attaches `type` (`finance.js:456-460`). The controller forwards only `from`/`to` to the model (`finance.controller.js:31-35`), and since none are passed, the model's `buildFilters({})` returns `WHERE is_active = 1` only (`cashflow.model.js:14-25`). Result: **`moneyIn − moneyOut` over all-time, including auto-created sales_revenue rows**.

Formula consistency with README: ✅ — `moneyIn` aggregates `capital_in` + `sales_revenue` from `cash_movements`; `moneyOut` aggregates `owner_draw + opex + capex`. README's prose at `:395-396` is misleading (it suggests adding `sales.total` directly), but the *numbers* match across all data the team can reach. Label "All-time cash flow" (`finance.js:82`) is honest about the timeframe — just not honest about what cash flow ≠.

### 3.2 What does the sparkline plot on its Y-axis?

`buildSparklineSVG()` accepts a `points[]` array (`finance.js:142-190`). The array is produced by `aggregateByGranularity()` (`finance.js:115-140`): every entry is added or subtracted into a bucket keyed by date/week/month/year, then a **running cumulative sum** is built (`running += buckets[k]`). So the Y-axis is the **cumulative cash position** over the time-ordered entry list. The chart color flips green→red if the final point goes negative (`finance.js:209-211`). The "Cash Flow" header has no Y-axis label, axis ticks, or hover values — owners can see "line going up/down" but cannot tell what it represents.

Verdict: the metric is the right one (cumulative position is exactly what the README calls "is my business growing"). The **visual is unlabeled and ambiguous**.

### 3.3 Is there a Profit / Loss card?

**No.** The Finance page surfaces no Profit metric anywhere. The Analytics page already calls `/api/analytics/profit` (implemented at `backend/controllers/analytics.controller.js:99-118`, model at `backend/models/sale.model.js:254-275`) and that implementation is correct: it computes `SUM(line_total) − SUM(quantity × products.cost)` over a date range. Finance should reuse this endpoint, not reinvent it.

**Recommended formula for the Finance Profit card**, adapted for the data available:

```
Profit (period) = SUM(sale_items.line_total in period)                    -- revenue
                − SUM(sale_items.quantity × products.cost in period)      -- COGS, realized only on sale
                − SUM(cash_movements.amount in period
                       WHERE type='opex' AND category != 'restock')        -- rent, utilities, etc.
                − SUM(cash_movements.amount in period
                       WHERE type='owner_draw' AND category='opex')        -- "I paid the bill from my pocket"
                − SUM(cash_movements.amount in period
                       WHERE type='capex')                                  -- equipment depreciation (or treat as period expense)
```

Notes:
- Restocks must be **excluded from opex** in the profit calc because their cost is already captured as COGS the moment the item sells. Including them would double-count.
- `owner_draw` rows with `category='personal'` / `'debt_payment'` / `'other'` are **not** P&L items — they are equity/financing distributions. Exclude them.
- `capital_in` is **not** a P&L item — it's financing. Exclude it.
- `capex` is debatable. Sari-sari stores have no fixed-asset depreciation schedule; expensing in-period is the closest honest signal. Worth flagging in a tooltip.

### 3.4 Is Outstanding Debt displayed as a primary card?

**Yes.** This contradicts the audit prompt's prior. The card is rendered (`finance.js:84-93`) when `localStorage.getItem('financeDebtBalanceVisible') !== 'false'`. The default behavior of `!== 'false'` is **show** — so by default, every user sees the Debt card. Value comes from `data.debtBalance` (`cashflow.model.js:124-129`), formula `MAX(0, SUM(capital_in.borrowed) − SUM(owner_draw.debt_payment))`, period-independent.

**Caveat:** the formula matches `category='debt_payment'`, but `seed.sql` writes payments with `category='loan_payment'`. So with seed data, debt shows the full borrowed amount and zero reduction. See §4.6.

### 3.5 Is Total Capital Invested displayed?

**No.** The `byCategory` and `byType` totals are returned in `/summary` but never rendered as a card. A non-technical owner who wants to answer "how much puhunan have I put in, lifetime?" must scroll the table and add it up manually.

### 3.6 Is there a page-level period selector?

**No.** Only the type filter exists (`finance.html:144-150`). All summary cards are all-time. The chart spans the full history of entries. The "is this month better than last?" question cannot be asked on this page.

---

## 4. Data Accuracy Audit (Part 3)

### 4.1 Sales double-count in Money In — **NOT PRESENT**

**Verdict: no bug.** The prompt's hypothesized double-count requires that `getSummary` both query `cash_movements` AND join the `sales` table. It does not.

Code path:
1. `cashflow.model.js:111-121` computes `moneyIn = SUM(CASE WHEN type IN ('capital_in','sales_revenue') THEN amount END)` against `cash_movements` only.
2. Every POS sale, inside the same DB transaction, inserts one row into `cash_movements` with `type='sales_revenue'`, `amount = saleRecord.total`, `source='sale'`, `source_id=saleId` (`sale.model.js:133-138`).
3. `sales.total` is never re-summed in the Finance pipeline.

**Reproducible test query** (run after creating a fresh sale):

```sql
-- (a) Confirm 1:1 mapping between sales and their cash_movements rows
SELECT s.id            AS sale_id,
       s.total         AS sale_total,
       COUNT(cm.id)    AS matched_cm_rows,
       COALESCE(SUM(cm.amount), 0) AS cm_total
  FROM sales s
  LEFT JOIN cash_movements cm
         ON cm.source = 'sale' AND cm.source_id = s.id AND cm.is_active = 1
 GROUP BY s.id
HAVING matched_cm_rows <> 1
    OR ABS(sale_total - cm_total) > 0.01;
-- expected: 0 rows (every sale has exactly one matching cm row of equal amount)

-- (b) Confirm Money In on the page == cash_movements only (no sales.total join)
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM cash_movements
    WHERE is_active=1 AND type IN ('capital_in','sales_revenue'))   AS finance_page_moneyIn,
  (SELECT COALESCE(SUM(amount),0) FROM cash_movements
    WHERE is_active=1 AND type='capital_in')
  + (SELECT COALESCE(SUM(total),0) FROM sales)                       AS what_readme_implies;
-- These should match (because every sale produces one sales_revenue row of equal amount).
-- They will diverge only if a sale fails partway after sale insert but before cm insert —
-- which the atomic transaction in sale.model.js:79-148 prevents.
```

**Action item (doc only):** rewrite README:395-396 so the formula matches the code:

```
Money In  = SUM(cash_movements.amount WHERE type IN ('capital_in','sales_revenue'))
```

### 4.2 Restock opex double-counting risk

When a restock is recorded with `recordExpense=true`, `product.model.js:116-122` auto-inserts an opex row with `source='restock'`. The frontend modal type selector does not offer "Operating Expense" (`finance.html:191-194` — only Capital In / Withdrawal), so a regular admin cannot manually create another opex via UI. **However**, a direct API call to `POST /api/finance` with `{type:'opex', category:'restock', amount:...}` is accepted — `opex` and `capex` have free-form categories per `CATEGORY_BY_TYPE[opex] = null` (`cashflow.model.js:9`), and the controller does not check for duplicates.

The auto-entry shows the literal text "auto" in the actions column (`finance.js:330-347`), which weakly distinguishes it. There is no badge in the row label, no link from the restock entry to its source `inventory_adjustment`.

**Severity: Low.** Not reachable via UI; only an issue for power users hitting the API directly.

### 4.3 Timezone correctness

| Path | How `occurred_at` is set | TZ behavior |
|---|---|---|
| Manual create (Capital In, Withdrawal) | Client-side string from `<input type="date">` (`finance.js:540`) | User-local — correct ✅ |
| Sale → sales_revenue | `(SELECT DATE(created_at) FROM sales WHERE id = ?)` (`sale.model.js:136-137`) | Derives from sale row's timestamp — consistent with what the History page shows, but interpreted in MySQL session TZ |
| Restock → opex | `CURDATE()` (`product.model.js:119`) | **MySQL session TZ.** Will drift by 1 day if server is UTC and Manila user restocks after 4pm local |
| `/summary` default range | None — query returns all-time | n/a |
| `/api/analytics/getProfit` default | `manilaFmt.format(...)` Asia/Manila explicit | Correct ✅ |

**Reproducible check:**

```sql
SELECT @@global.time_zone, @@session.time_zone, CURDATE(), DATE(NOW()), NOW();
-- If session.time_zone is 'SYSTEM' or 'UTC' on a non-Manila host,
-- restocks logged after ~16:00 Manila time will land on yesterday's date.
```

**Recommendation:** in `product.model.js:119`, replace `CURDATE()` with the same Manila-aware pattern used in `analytics.controller.js:7` (`new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())`), pass into the INSERT as a `?` param. Alternatively (less invasive): `DATE(CONVERT_TZ(NOW(), '+00:00', '+08:00'))` if you can trust the server to be UTC.

### 4.4 Soft-delete propagation

`Cashflow.softDelete()` flips `is_active=0` only on `source='manual'` rows (`cashflow.model.js:102-109`). All read paths (`getAll`, `getSummary`, `getById`) include `is_active=1` in their WHERE clauses (`cashflow.model.js:24,48,128` and via `buildFilters`). The frontend's `handleDelete()` awaits the API call and then calls `loadData()` (`finance.js:502-514`), which re-fetches summary + movements + the all-data variant for the chart in parallel (`finance.js:468-494`).

**Verdict:** propagation is correct. Net Balance, Debt Balance, byType, byCategory, and the sparkline all reflect a deleted entry on the next render. ✅

### 4.5 Decimal precision

`cash_movements.amount` is `DECIMAL(10,2)` (`schema.sql:100`). mysql2's default for DECIMAL is to return strings to preserve precision. The model coerces via `Number(...)` in two places: `Number(row.moneyIn)` / `Number(row.moneyOut)` (`cashflow.model.js:151-152`), and `Number(r.total)` inside `byType` / `byCategory` (`cashflow.model.js:139,149`).

JS `Number` is IEEE-754 double — safe integers up to 2^53 (~9×10^15). DECIMAL(10,2) caps at ₱99,999,999.99. Even multiplied by all the rows in a sari-sari store's lifetime, totals stay well under 2^53. **No precision risk in practice.**

If you ever scale this to multi-tenant / multi-year per tenant, switch to a Decimal library (e.g., `decimal.js`) at the model boundary.

### 4.6 Debt balance — seed/category mismatch

`cashflow.model.js:127` matches `category='debt_payment'`. `seed.sql:35,39` writes `category='loan_payment'`:

```sql
-- seed.sql:35
(5, 'owner_draw', 'loan_payment',   500.00, ..., '2025-02-05', 'manual', 1),
-- seed.sql:39
(9, 'owner_draw', 'loan_payment',   500.00, ..., '2025-03-05', 'manual', 1),
```

**With seed data installed, the Debt Balance card shows ₱5,000 (the borrowed amount) and zero reduction — even though the seed clearly intends for ₱1,000 to have been paid back.** This is visible on every dev's screen on first install.

**Reproducible test:**

```sql
SELECT category, COUNT(*), SUM(amount)
  FROM cash_movements
 WHERE type='owner_draw' AND is_active=1
 GROUP BY category;
-- After running seed.sql you will see:
--   loan_payment | 2 | 1000.00     ← seed used this
--   debt_payment | 0 | 0           ← model expects this
--   personal     | 1 |  300.00
```

**Fix:** `database/seed.sql` lines 35 and 39 — replace `loan_payment` with `debt_payment`. (The README's transition note at `:1408-1422` already documents the rename.) Memo at user's `project_ai_phase.md` also flags this rename.

Additional defensive idea: add a one-line migration that rewrites legacy `loan_payment` rows to `debt_payment` for any installs that ran the old seed.

### 4.7 Capex display sign — table vs chart disagree

`finance.js:311` decides the sign in each row:

```js
var isOut = ['owner_draw', 'opex'].includes(entry.type);
```

`capex` is missing. A ₱1,200 freezer purchase (`capex / equipment` per seed row 8) renders as `+ ₱1,200.00`, which to an owner reads as *money in*.

The same file's chart aggregator gets it right at `:134`:

```js
var isOut = entry.type === 'owner_draw' || entry.type === 'opex' || entry.type === 'capex';
```

So the chart correctly bends downward but the row says "+". **Visual contradiction inside the same page.**

**Fix:** add `'capex'` to the list at `finance.js:311`. One-line change.

---

## 5. Security Audit (Part 4)

### 5.1 POST `/api/finance` validation

| Check | Where | Status |
|---|---|---|
| `type` ∈ enum (rejects sales_revenue from manual) | `finance.controller.js:46-50` | ✅ |
| `amount` is positive number | `finance.controller.js:52-53` | ✅ |
| `amount` has a sane **upper bound** | — | ❌ Missing. Mistype 5000000.00 → 50000000.00 accepted; ₱99,999,999.99+ causes DB overflow rather than friendly 400. Recommend reject `amount > 10_000_000`. |
| `occurred_at` regex YYYY-MM-DD | `finance.controller.js:55-56` | ✅ Format only |
| `occurred_at` plausibility (not 100 years from now) | — | ❌ Missing. Recommend reject dates > 1 year ahead or > 10 years behind. |
| `category` whitelist for `capital_in` / `owner_draw` | `cashflow.controller.js:5-12` via `CATEGORY_BY_TYPE` (`cashflow.model.js:6-12`) | ✅ |
| `category` for `opex` / `capex` (free-form) | `CATEGORY_BY_TYPE[opex]=null`, treated as accept-any (`finance.controller.js:7-8`) | ⚠️ Free-form by design; consider trimming + length cap (e.g., ≤ 64 chars) to prevent abuse |
| `description` length cap | — | ❌ Missing. DB column is TEXT so any length accepted. Recommend `≤ 500 chars`. |

### 5.2 Auto-entry edit/delete protection

Double-layered:
- Controller-level reject when `existing.source !== 'manual'` (`finance.controller.js:84, 122`).
- Model-level `AND source = 'manual'` in the SQL WHERE clause (`cashflow.model.js:95, 105`).

**A direct API call cannot bypass either layer.** ✅

### 5.3 Admin-only enforcement

`finance.routes.js`:

```js
router.get('/',       authMiddleware,                  controller.getAll);
router.get('/summary', authMiddleware,                 controller.getSummary);
router.post('/',      authMiddleware, adminMiddleware, controller.create);
router.put('/:id',    authMiddleware, adminMiddleware, controller.update);
router.delete('/:id', authMiddleware, adminMiddleware, controller.remove);
```

POST/PUT/DELETE are admin-only; reads are auth-only. README:686-687 documented admin-only delete; in practice admin-only also applies to create and edit, which is stricter than spec — and reasonable (cashiers should not be inventing capital injections). `adminMiddleware` (`backend/middleware/auth.middleware.js:20-28`) returns 403 if `req.user.role !== 'admin'`. ✅

### 5.4 Cross-user data accuracy

`recorded_by` is set from `req.user.id` (`finance.controller.js:68`). No store_id in schema (correct — single-tenant). Audit trail intact. ✅

### 5.5 SQL injection on filter params

`buildFilters` (`cashflow.model.js:14-25`) builds a parameterized WHERE: every value goes into `params[]` and is passed positionally to `db.query(sql, params)`. The only field that interpolates as a string is the `type` literal — but that's whitelisted against `VALID_TYPES.includes()` first (line 17). `category`, `from`, `to` are pure `?` placeholders. mysql2 prepared statements escape correctly. ✅

**One minor brittleness:** `buildFilters` always returns a non-empty WHERE (because `'is_active = 1'` is unconditionally added at `:15`), so the `${where}` interpolation in `getSummary` and `getAll` never produces an SQL syntax error. If anyone refactors `buildFilters` to ever return an empty conditions list, the `AND category IS NOT NULL` tail at `cashflow.model.js:144` would become `WHERE AND category IS NOT NULL` and break. Worth a comment.

---

## 6. UX Audit (Part 5)

### 6.1 Five-second comprehension test

Open the page with no context. Can you answer these without clicking?

| Question (in the language an owner would ask) | Card on page? | Answer immediate? |
|---|---|---|
| "Magkano pera ko ngayon?" / How much cash? | Net Balance | ✅ Yes — but the label "Net Balance" is jargon |
| "Kumita ba ako ngayong buwan?" / Did I make money this month? | — | ❌ **No card** |
| "Magkano pa utang ko?" / How much utang? | Debt Balance | ✅ Yes |
| "Magkano puhunan ko na lahat?" / Total capital invested? | — | ❌ **No card** |
| "Saan napupunta pera ko?" / Where does my money go? | — | ❌ **No breakdown chart** |

**Two of the five most natural questions are unanswerable** without the owner doing the math themselves. The page over-indexes on cash position and under-serves the questions about *whether the business is working*.

### 6.2 Label clarity

| Current label | Plain-language alternative |
|---|---|
| Net Balance | **Cash on Hand** ("Pera mo ngayon") |
| Debt Balance | **Outstanding Debt** ("Utang mo") |
| Cash Flow | **Money Trend** or **Cash Position over Time** (with axis label) |
| Withdrawal *(in filter)* | **Owner Withdrawal** (to distinguish from business expenses) |

The modal's notes placeholder *is* in Taglish (`finance.html:232` — "Bayad sa 5-6, kuryente, binili supplies..."), which is good. Card titles should match that voice.

### 6.3 "Withdrawal" filter ambiguity

`finance.html:148` filter value `owner_draw`. So selecting "Withdrawal" shows only owner-draw entries — **not opex, not capex**. An owner looking for "what did I spend this month?" cannot get there from any single filter selection. They must select "All Types" and mentally subtract sales and capital.

**Recommended filter set after redesign:**

```
[ All Types ]   [ Sales ]   [ Capital In ]   [ Owner Withdrawal ]   [ Business Expense ]
                                                                     (opex + capex)
```

### 6.4 Empty state

`finance.js:291-296`:

```js
financeTableBody.innerHTML =
  '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--color-text-muted);">No entries found.</td></tr>';
```

Plain text in a single cell. No illustration, no CTA, no link to the Inventory restock flow (the place where most expense entries actually originate). A first-day owner sees a discouraging blank table.

**Recommendation:** show a 3-step "Get Started" panel:
1. Tap **+ Add Entry** to log your starting capital (puhunan).
2. Go to **Inventory** → **Restock** to log stock purchases (these will show up here automatically).
3. Make a sale on **New Order** — daily sales totals will appear here as you go.

### 6.5 Auto-entry visibility

Auto rows show the literal text "auto" in the actions column (`finance.js:330-347`). It's small, gray, and the only signal. There's no badge in the description, no link to the source restock or sale. An owner who didn't make the connection between Inventory → restock → cash_movement might be confused why expenses appear they didn't enter manually.

**Recommendation:** in the description cell, render a small chip like `[from Restock]` or `[from POS]` next to the type label. Optionally, clicking the chip jumps to the source row on Inventory / History.

---

## 7. Redesign Proposal (Part 6)

**Goal:** answer the four MSME questions head-on, in plain Taglish, with clear separation between cash position and profit. Keep the data layer untouched (it's correct); push the changes into the presentation layer and one new endpoint method that reuses existing model functions.

### 7.1 Page layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  Finance                              [ This Month ▾ ]    + Add Entry │
├────────────────────────────────────────────────────────────────────────┤
│  Ngayong buwan: kumita ka ng ₱4,600. Gastos ₱6,200. Cash ₱28,400.     │
│  Utang ₱6,000.                                                         │
├────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ │
│ │ Cash on Hand  │ │ Profit       │ │ Outstanding  │ │ Total Capital │ │
│ │ Pera mo       │ │ Kita ngayong │ │ Debt         │ │ Invested      │ │
│ │ ngayon        │ │ buwan        │ │ Utang mo     │ │ Puhunan mo    │ │
│ │               │ │              │ │              │ │               │ │
│ │  ₱28,400.00   │ │  ₱4,600.00   │ │  ₱6,000.00   │ │  ₱20,000.00   │ │
│ │  ⓘ not profit │ │  ↑ ₱800 vs   │ │  Aling       │ │  Own ₱12,000  │ │
│ │               │ │   last month │ │  Marites 5-6 │ │  Loan ₱8,000  │ │
│ └───────────────┘ └──────────────┘ └──────────────┘ └───────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────┐ ┌──────────────────────────────────┐│
│ │  Cumulative Cash Position      │ │  Saan napupunta pera mo (this   ││
│ │  ₱ ────────────────────────    │ │  period)                         ││
│ │     ╱╲    ╱╲╱─────             │ │   ╭───────╮                      ││
│ │    ╱  ╲  ╱                     │ │   │ Resto │ Restocks  60%        ││
│ │   ╱    ╲╱                      │ │   │ cks   │ Rent      14%        ││
│ │  ↑capital  ↓restock            │ │   ╰───────╯ Utilities  8%        ││
│ │  Jan         Mar           May │ │             Withdraw   12%       ││
│ │                                │ │             Other       6%       ││
│ └────────────────────────────────┘ └──────────────────────────────────┘│
├────────────────────────────────────────────────────────────────────────┤
│ Cash Flow Entries          [ All ▾ ] [ Sales ▾ ] ... + Add Entry      │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Date     Description                  Amount     Notes      ⋮     │ │
│ │ 2026-05-26 Sales (12)                + ₱2,100               —     │ │
│ │ 2026-05-25 Restock [from Restock]    − ₱1,200   Bear Brand  —     │ │
│ │ ...                                                                │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Header strip

- **Page title** + period selector (top right): `This Month` (default) / `Last Month` / `Last 3 Months` / `This Year` / `All Time` / `Custom`. Selector persisted in `localStorage` per-device.
- **Plain-language one-liner** beneath the title. Built client-side from the four card values:

```
"Ngayong [period]: kumita ka ng ₱X, gastos ₱Y, cash ₱Z. Utang ₱W."
```

When profit is negative, swap to `nawalan ka ng ₱X`. Empty months: `"Walang transaction sa [period] na ito."`

### 7.3 Four cards (replacing the current two-and-a-chart layout)

| # | Title | Subtitle (Taglish) | Value | Period? | Source endpoint |
|---|---|---|---|---|---|
| 1 | **Cash on Hand** | Pera mo ngayon | `moneyIn − moneyOut` | All-time, but the chart and Profit cards respect the selector. Optional tooltip: *"This is your cash balance, not your profit. Capital you put in counts here too."* | `GET /api/finance/summary` (no params) |
| 2 | **Profit** | Kita ngayong [period] | See formula in §3.3 | Period | New: `GET /api/finance/profit?from=&to=` — wraps existing `saleModel.getProfit(from,to)` + opex/capex from `cashflow.model`. Returns `{revenue, cogs, opex, capex, profit, previousProfit}` |
| 3 | **Outstanding Debt** | Utang mo | `MAX(0, borrowed − debt_payment)` | Period-independent | Already in `/summary` `.debtBalance` |
| 4 | **Total Capital Invested** | Puhunan mo | `SUM(capital_in)` lifetime, broken down Own / Borrowed | Period-independent | Add to `/summary` response: `byCategory.own`, `byCategory.borrowed` (already aggregated, just expose) |

Cards 3 and 4 are period-independent and visually muted (grey accent) so users learn the difference. Cards 1 and 2 are the active period-controlled pair.

### 7.4 Charts row

- **Cumulative Cash Position** (line, replaces sparkline): same math as today but with proper **Y-axis label** ("Cash position, ₱"), x-axis ticks, and annotation markers — upward triangles at `capital_in` events, downward triangles at large opex/capex. Drawn only over the selected period. Hover tooltip shows date + value.
- **Expense Breakdown** (donut, new): `cash_movements` for the selected period, grouped by category. Buckets: **Restocks** (opex+capex with category='restock'), **Rent**, **Utilities**, **Withdrawals** (owner_draw all categories), **Other**. Click a slice → table filter applies.

### 7.5 Optional waterfall

Beneath the cards, behind a `Show details` toggle (off by default), a horizontal waterfall:

```
Start    +Cap    +Sales   −Restocks  −Other   −Withdraw   = Now
₱0  →   ₱20K  →  ₱65K   →   ₱35K   →  ₱30K  →   ₱28K
```

This is the single best storytelling chart for non-technical owners — but it eats vertical space, so make it collapsible.

### 7.6 Cashflow entries table

Keep current grouping (daily sales rolled up) and pagination. Changes:
- Add a chip in the description cell for auto-entries: `<span class="chip">from Restock</span>` / `from POS`.
- Add `'capex'` to the `isOut` array (`finance.js:311`).
- Replace "Withdrawal" filter with two: **Owner Withdrawal** (`owner_draw`) and **Business Expense** (`opex`,`capex`). Keep `sales_revenue` filter renamed to "Sales".

### 7.7 Add Entry modal

Keep modal as-is. Two improvements:
- Add **helper text** under each category: e.g., on `owner_draw → debt_payment`: *"Bayad sa 5-6 o anumang utang. Hindi ito gastos ng tindahan."*
- Add **expense entry** to the type selector: `Business Expense` → maps to `opex`, free-form category. The current workaround (using `owner_draw → opex`) is structurally confusing.

### 7.8 Complexity & risk estimate

| Change | Complexity | Schema change? | New endpoint? | New model fn? |
|---|---|---|---|---|
| Fix capex sign in table (`finance.js:311`) | S | No | No | No |
| Fix `loan_payment` → `debt_payment` in seed.sql | S | No | No | No |
| Replace `CURDATE()` with Manila date in `product.model.js:119` | S | No | No | No |
| Add validation: amount upper bound + future date check | S | No | No | No |
| Period selector (header) + wire to summary/profit/chart calls | M | No | No | No |
| Profit card | M | No | **Yes** — `GET /api/finance/profit` (composes existing model fns) | No (compose existing) |
| Total Capital Invested card | S | No | No | Extend `/summary` response shape only |
| Plain-language one-liner | S | No | No | Pure FE |
| Cumulative Cash Position chart with annotations | M | No | No | No (FE math) |
| Expense Breakdown donut | M | No | No | No (use existing `byCategory`) |
| Auto-entry chip in row | S | No | No | No |
| Filter dropdown restructure (split Withdrawal / Business Expense) | S | No | No | No |
| Empty-state Get Started panel | S | No | No | No |
| Add `opex` to modal type selector | S | No | No | No |
| Waterfall chart (optional) | L | No | No | No |
| README rewrite (formulas, default range, 3-card layout) | S | No | No | No |

**Zero schema changes. One new HTTP endpoint that composes existing models.**

---

## 8. Demo Seed Data Plan (Part 7)

The current seed (`database/seed.sql:30-40`) is 10 hand-typed `cash_movements` rows spanning fixed dates in early 2025, with the `loan_payment` category bug (§4.6). It does not coordinate with the sales or inventory seeds, so the AI page, Analytics page, and Finance page tell inconsistent stories.

### 8.1 Goals for the new seed

- **Deterministic**: every developer's machine produces the same numbers — no random drift in demos.
- **Date-relative**: anchored to the date the seed is run, so a demo recorded today is still fresh next month. Use `CURDATE() - INTERVAL N DAY` arithmetic (note: this picks up the same timezone caveat as §4.3; pick MySQL session = Asia/Manila for seeding).
- **Story-coherent**: a mildly profitable store with mixed own + borrowed capital, partial debt repayment, weekly restocks aligned with the inventory seed, and monthly fixed costs.
- **One source of truth**: produced by a single seed script (`database/seed.sql` or a new `database/seed_finance.sql` referenced from it) that the AI audit's seed work also keys off.

### 8.2 Target end-state (after running the seed today)

| Metric | Value | Notes |
|---|---|---|
| Total Capital Invested | ₱20,000 | ₱12,000 own + ₱8,000 borrowed |
| Outstanding Debt | ₱6,000 | ₱8,000 borrowed − ₱2,000 paid back |
| Lifetime sales revenue | ~₱45,000–60,000 | matches sales seed |
| Lifetime restocks (auto opex from inventory seed) | ~₱28,000 | weekly cadence |
| Lifetime rent + utilities | ~₱13,000 | recurring fixed costs |
| Lifetime owner withdrawals (personal) | ~₱3,000 | small monthly cash-outs |
| Cash on Hand today | ~₱28,000–32,000 | depends on month-end gaps |
| Profit (last 30 days) | ~₱4,000–6,000 | small but positive |

### 8.3 Entry list (relative to `:today`)

| Offset (days) | Type | Category | Amount | Description |
|---|---|---|---|---|
| -45 | capital_in | own | 12,000.00 | Sariling ipon para sa simula |
| -45 | capital_in | borrowed | 8,000.00 | Puhunan mula kay Aling Marites (5-6) |
| -42 | capex | equipment | 2,500.00 | Maliit na display freezer (secondhand) |
| -40, -33, -26, -19, -12, -5 | opex (via inventory.restock) | restock | 4,000–6,000 | One restock per ~week, supplier names rotated. **Created via the inventory seed; appear here as auto-entries.** |
| 1st of each month within range | opex | rent | 3,000.00 | Bayad upa ng espasyo — [month] |
| 5th, 20th of each month | opex | utilities | 1,500.00 / 500.00 | Kuryente / tubig |
| -30 | owner_draw | personal | 2,000.00 | Pampamilya |
| -15 | owner_draw | debt_payment | 2,000.00 | Bayad kay Aling Marites — 1st installment |
| -5 | owner_draw | personal | 1,000.00 | Pang-araw-araw |
| daily, -45..today (~3-8 transactions/day) | sales_revenue | — | varies | **Created by the sales seed**; auto-write `cash_movements` rows. ~₱1,000–₱1,500/day average. |

### 8.4 Coordination with the AI / sales seed

The AI audit (sibling branch `audit/ai-feature`) is expected to produce a sales+inventory seed covering the same date range. The Finance seed should NOT separately create `sales_revenue` rows — those are produced by the sales seed via the atomic transaction in `sale.model.js:79-148`. Similarly, restocks should be created via the inventory seed using `Product.adjustStock(..., expenseData)` so the same atomic path runs.

**One script, three pages benefit:** the AI dashboard's "yesterday block," Analytics' profit chart, and the new Finance page all read from the same `cash_movements` and `sales` tables. A single coordinated seed eliminates the demo-divergence risk.

### 8.5 Implementation approach

Two options:

**Option A — Pure SQL seed:** Extend `seed.sql` with a `CALL seed_finance()` stored procedure that uses `DATE_SUB(CURDATE(), INTERVAL N DAY)` to compute offsets. Pros: simple, no new files. Cons: writes `cash_movements` directly (bypasses model layer), so any future change to the model's invariants won't be enforced.

**Option B — Node seed script:** New `database/seed-finance.js` that imports `cashflow.model.js`, `product.model.js`, `sale.model.js` and runs through the same paths the app uses. Pros: exercises the same code paths, catches model regressions. Cons: requires the dev to run `node database/seed-finance.js` after `mysql < seed.sql`.

**Recommendation: B.** Pair with the AI seed work — one combined `seed-demo.js` that produces all three pages' demo data through the real model layer. Worth the extra 30 minutes of setup; pays back forever in demo reliability.

---

## 9. Strategic Recommendations (Part 8)

### 9.1 Should we adopt Profit as a primary metric? — **Yes.**

Without it, the page cannot honestly tell an owner whether the business is working. Every comparable product (QuickBooks, Wave, Xero, even consumer apps like Mercury) treats Cash Position and Profit as separate, never combined. The app's mission — *teach non-technical MSME owners financial literacy* — collapses if the primary metric secretly conflates capital with earnings. The implementation is cheap (existing `getProfit` model) and the conceptual gain is enormous.

### 9.2 Should the page have a period selector? — **Yes.**

"Is this month better than last?" is the question most owners ask before any other. Without a period scope, every card shows lifetime totals, which means a 6-month-old store is judged against its founding-day numbers forever. Default to **This Month**, persist user selection per-device. The selector affects Profit, the cumulative-cash chart, the expense-breakdown donut, and the entry table. Cash on Hand, Outstanding Debt, and Total Capital Invested stay period-independent (they are balance-sheet quantities, not flow quantities).

### 9.3 Should auto-restock entries be visually distinct? — **Yes.**

A small chip in the description cell ("from Restock", "from POS") is enough. The current "auto" text in the actions column is too quiet — owners who didn't make the Inventory → Finance connection will think the system invented expenses. Aim for *legibility*, not decoration.

### 9.4 Should we allow manual debt-balance override? — **Yes, gated behind an action, not a card field.**

5-6 lenders charge interest (commonly 20% per cycle), which the schema doesn't model. Over time `borrowed − debt_payments` will diverge from what the lender actually says is owed. Recommended UX: a `Set actual balance` button on the Outstanding Debt card → small modal asking *"Magkano talaga sabi ni [lender]?"* → records a `manual_debt_balance` row (new column `cash_movements.snapshot_balance` or a new `debt_snapshots` table — small schema change, but contained). The card then displays `MAX(snapshot, computed)`. Tooltip explains the discrepancy. Don't auto-overwrite — just override the display while keeping the audit trail honest.

(This is the one place a small schema change is worth it. Treat as a separate Phase-5.1 feature.)

### 9.5 Onboarding modal — **Yes, brief, one-time.**

On first Finance page visit (per user), show a one-screen modal:

> *"Cash on Hand ay 'yung pera mo ngayon. Profit ay kung kumita ka ba talaga.*
> *Hindi pareho 'yan. Halimbawa: kung naghulog ka ng ₱5,000 puhunan ngayon, tumaas ang Cash, pero zero pa rin ang Profit. Ang Profit ay galing sa benta minus gastos."*
>
> [Got it — itago ito]

The user's `project_ai_phase.md` memory confirms the onboarding system already exists (Phase 6, COMPLETE) — this fits as one new tour step or a one-time inline panel, not a new system.

### 9.6 "Ask Os about your finances" CTA — **Yes, lightweight.**

The Os assistant (Phase 4 AI, COMPLETE) already understands `moneyIn`, `moneyOut`, `net`, `debtBalance`, restocks, slow movers, etc. (per the README's AI context section at `:1247-1255`). Add a small button on the Profit card: **"Ask Os about your finances →"** that opens the Os panel pre-filled with one of three rotating prompts:

- *"Bakit bumaba ang kita ko ngayong buwan?"*
- *"Saan napupunta ang gastos ko?"*
- *"Kayang-kaya ko bang bayaran ang utang sa susunod na buwan?"*

Lightweight wiring (one button, one pre-fill action), high pedagogical value.

---

## 10. Ordered Work Plan

Tags: **Critical** (incorrect numbers on screen now) · **High** (key UX/conceptual gaps) · **Medium** (polish & robustness) · **Low** (docs)

| # | Change | Tag | Complexity |
|---|---|---|---|
| 1 | Fix seed.sql `loan_payment` → `debt_payment` (lines 35, 39). Debt card shows wrong balance for every fresh install. | **Critical** | S |
| 2 | Add `'capex'` to the isOut array (`finance.js:311`). Capex entries currently show as income in the table. | **Critical** | S |
| 3 | Profit card + new `GET /api/finance/profit` endpoint composing existing model fns. | **High** | M |
| 4 | Page-level period selector + wire to summary/profit/chart calls. | **High** | M |
| 5 | Total Capital Invested card (Own / Borrowed split from existing `byCategory`). | **High** | S |
| 6 | Replace ambiguous "Cash Flow" sparkline with labeled Cumulative Cash Position chart (axis labels, annotation markers). | **High** | M |
| 7 | Plain-language one-liner under the page title. | **High** | S |
| 8 | Expense breakdown donut for selected period. | **High** | M |
| 9 | Restock cash_movement: replace `CURDATE()` with Manila-aware date (`product.model.js:119`). | **Medium** | S |
| 10 | Filter dropdown: rename "Withdrawal" → "Owner Withdrawal"; add "Business Expense" mapping to `opex`,`capex`. | **Medium** | S |
| 11 | Auto-entry chip in description cell ("from Restock" / "from POS"). | **Medium** | S |
| 12 | Validation: amount upper bound (₱10M); occurred_at future-date check; description length cap. | **Medium** | S |
| 13 | Replace empty-state with 3-step Get Started panel. | **Medium** | S |
| 14 | Add `Business Expense` (opex) entry to the Add Entry modal type selector + Taglish helper text per category. | **Medium** | S |
| 15 | Onboarding tour step explaining Cash vs Profit. | **Medium** | S |
| 16 | "Ask Os about your finances" CTA on Profit card. | **Medium** | S |
| 17 | Coordinated demo seed script (`database/seed-demo.js`) covering finance + sales + inventory through real model layer. Coordinate with `audit/ai-feature` branch. | **High** | M |
| 18 | Outstanding-debt manual override modal + `debt_snapshots` table. | **Medium** | M |
| 19 | Optional waterfall chart behind a `Show details` toggle. | **Low** | L |
| 20 | README fixes: §4.4 (Money In formula prose), §5 (`/summary` default), §10.3 (3-card layout), §11.5 (`loan_payment`→`debt_payment`). | **Low** | S |
| 21 | Defensive comment on `buildFilters` invariant (`cashflow.model.js:14-25`) noting that `is_active=1` makes the WHERE always non-empty. | **Low** | S |

**Branch coordination:** items 17, 20 overlap with `audit/ai-feature`. Merge `audit/ai-feature` first (it's older), rebase this branch, then ship items 1–16 as the first Finance PR. Items 17, 18, 19 are separate follow-up PRs.

---

## Appendix — File:Line Index

| Topic | Path:Line |
|---|---|
| Money In formula (correct, all-time, single source) | `backend/models/cashflow.model.js:115-121` |
| Debt formula (uses `debt_payment` category) | `backend/models/cashflow.model.js:124-129, 157` |
| Sale → cash_movements (sales_revenue, atomic) | `backend/models/sale.model.js:133-138` |
| Restock → cash_movements (uses CURDATE()) | `backend/models/product.model.js:116-122` |
| Realized profit (revenue − COGS) | `backend/models/sale.model.js:254-275` |
| Profit endpoint | `backend/controllers/analytics.controller.js:99-118` |
| POST /finance validation | `backend/controllers/finance.controller.js:42-75` |
| Auto-entry edit/delete rejection | `backend/controllers/finance.controller.js:84, 122` + `cashflow.model.js:95, 105` |
| Routes & middleware | `backend/routes/finance.routes.js:6-10` |
| Net Balance card render | `frontend/js/pages/finance.js:75-83` |
| Sparkline cumulative aggregation | `frontend/js/pages/finance.js:115-140` |
| Capex sign bug | `frontend/js/pages/finance.js:311` |
| Filter dropdown values | `frontend/pages/finance.html:144-150` |
| Modal type selector (Capital In / Withdrawal only) | `frontend/pages/finance.html:191-194` |
| Auto-entry "auto" label | `frontend/js/pages/finance.js:330-347` |
| Empty state | `frontend/js/pages/finance.js:291-296` |
| Seed `loan_payment` bug | `database/seed.sql:35, 39` |
| Schema (cash_movements, all DECIMAL(10,2)) | `database/schema.sql:96-109` |
| README Money In formula (misleading) | `README.md:395-396` |
| README summary default (wrong) | `README.md:662-663` |
| README 2-card vs shipped 3-card | `README.md:1463-1466` |
| README phase-5 module status | `README.md:1372-1488` |

---

*End of audit.* No code changes have been made. Awaiting approval before any implementation. Recommended next step: review §1, §3, §4.1, §4.6, §4.7 first — those are the load-bearing findings.
