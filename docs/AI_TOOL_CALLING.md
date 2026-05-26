# Tool-Calling for Os: Design Note

Status: **proposal, not approved**
Author note: this is a planning artifact, not a spec. It captures the
trade-offs of moving `/chat` away from the current "dump 30-day
aggregates into the prompt" pattern toward Groq native function-calling.
Read this *before* the next planning session on Os capabilities.

---

## 1. What we have today

`backend/controllers/ai.controller.js` builds every chat request the same
way:

1. `ai/context-builder.js#fetchContext()` makes **7 parallel SQL calls**
   into the sale / product / cashflow models.
2. `buildContextText(ctx)` flattens that into a ~30-line block prepended
   to the user's message.
3. Os (Groq Llama 3.3 70B) answers using only what's in that block.

It works. The verified examples from this session — "Anong pinakamabentang
araw ng linggo?", "Magkano utang ko?", "How's my business this week?" —
all return correct, grounded answers because the data the user asked
about is already in the prepended context.

The system prompt enforces: *"Base every answer ONLY on the data provided
to you. Never invent product names, sales figures, or amounts."*
(`ai/prompts/system.js:24-25`). Os obeys.

## 2. Where dump-context starts to hurt

When the user asks something the 30-day rollup *doesn't* contain:

- **"What was my best Tuesday in April?"** — context shows day-of-week
  averages over the last 30 days, not per-Tuesday detail. Os has to
  punt: *"wala akong sapat na data"*.
- **"How did Bear Brand Milk do last week vs this week?"** — context
  shows top 5 by revenue / qty, not per-product weekly slices.
- **"Which payday was my biggest, May 15 or April 30?"** — historical
  payday detail isn't in the window.
- **"Show me my dead stock from 60 days ago."** — window is fixed at
  30 days (`ai/context-builder.js:18`).

The honest fix isn't "dump more context" — that hits token limits and
adds noise to the easy questions. The fix is letting Os **ask the
database for what it needs**.

## 3. The tool-calling pattern

Groq's chat completions endpoint supports OpenAI-style tool-calling.
The flow:

```
[1] System prompt + user message + tool schemas → Groq
[2] Groq returns either text (done) OR a tool_call ("get_top_products(...)")
[3] Backend executes the tool (runs SQL) and returns the result
[4] Backend sends the tool result + chat history back to Groq
[5] Groq either calls another tool or returns the final answer
```

No new privileges for the LLM — every tool is a backend-controlled
function executing pre-written SQL. The LLM just *picks which one* and
supplies the parameters. Same security posture as today.

## 4. Proposed tool surface

Each maps one-to-one to a model function we already have, with a thin
JSON-schema wrapper. Initial set (read-only, aggregates only — same
rules as the current context):

| Tool name | Purpose | Already in code |
|---|---|---|
| `get_sales_summary(from, to)` | Total revenue / tx count / avg in a window | `saleModel.getSummary` |
| `get_kpis(from, to)` | Revenue, orders, avg, units | `saleModel.getKPIs` |
| `get_top_products(metric, from, to, limit)` | metric ∈ `revenue\|qty\|profit` | `getTopByRevenue` / `getTopByQty` / `getProfitByProduct` |
| `get_day_of_week_stats(from, to)` | Avg per weekday with sample count | `getDayOfWeekStats` (just added) |
| `get_inventory_health(from, to)` | Dead / slow / fast movers | `getInventoryHealth` |
| `get_low_stock_alerts()` | Currently low + out of stock | `productModel.getLowStock` |
| `get_cashflow(from, to)` | moneyIn / moneyOut / net / utang | `cashflowModel.getSummary` |
| `get_today_summary()` | Today's revenue / tx / avg | `saleModel.getTodaySummary` |
| `get_goal_projection()` | MTD + trailing-30d projection | `getGoalProjectionInputs` |

Notably absent (deliberately):
- No raw `query_sql(...)` tool. Ever. That's where security goes to die.
- No `get_sale_by_id` or `get_receipt`. Per-transaction detail isn't
  what owners ask about and the context-builder already excludes it.
- No write tools. Os is read-only; "adjust stock" lives in the UI.

## 5. Where this wins

Concrete questions that become answerable:

- **"Best Tuesday in April?"** → `get_top_products(metric='revenue', from='2026-04-01', to='2026-04-30')` filtered to Tuesdays via a follow-up tool, OR a new `get_sales_by_day_of_week_filtered`. The shape is composable.
- **"Bear Brand Milk last week vs this week?"** → two `get_top_products` calls scoped to a single product across two windows, then comparison in the LLM.
- **"Why did Saturday drop this month?"** → `get_day_of_week_stats` for last month vs this month + `get_top_products` for Saturdays to see what changed.
- **"What's my best margin product?"** → `get_top_products(metric='profit')`.

Also wins on **token economy** for simple questions. Today every chat
ships the full 30-line context block (~400 tokens) even for "what's
my utang?". With tool-calling, that question becomes "call
`get_cashflow()`, get back one row, answer." ~80 tokens instead of 400.

## 6. Where this loses (or breaks even)

- **Latency.** Today: 1 round-trip to Groq, ~800-1500 ms. With tools: 2
  round-trips per tool used. A question that fires 2 tools is ~2x slower.
  Streaming gets weirder — you can stream the final answer but not the
  tool-call decision in the middle.
- **Daily brief / restock advice.** These are *aggregation* tasks where
  the LLM benefits from seeing everything at once. They already work and
  are now cached at 7 ms per `daily_brief`. Moving them to tools is pure
  loss.
- **Reliability.** Tool-calling adds a parsing surface: the LLM
  occasionally hallucinates tool names, mis-fills arguments, or calls
  the same tool 5 times. Need a retry / cap policy.
- **Caching.** The current per-question MD5 cache (`ai/assistant.js:9`)
  becomes much harder. Each tool call is a fork in the conversation;
  caching at the conversation level instead of question level is a
  bigger refactor.
- **Observability.** Today one row in `ai_query_log` per request. With
  tools, a single request could fire 3-4 LLM round-trips + 3-4 SQL
  reads. The log schema needs a `parent_query_id` column or a separate
  `ai_tool_call_log` to keep it sane.

## 7. Implementation sketch (if approved)

Hybrid, not full migration. Keep the dump-context path for the GET
endpoints (`/summary`, `/restock`, `/forecast`, `/profit`) — they're
aggregation tasks, already cached, no reason to change. Only `/chat`
and `/chat/stream` would switch.

```js
// ai/tools.js — new file
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_top_products',
      description: 'Top products by revenue, units sold, or profit within a date range.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['revenue', 'qty', 'profit'] },
          from:   { type: 'string', format: 'date' },
          to:     { type: 'string', format: 'date' },
          limit:  { type: 'integer', default: 5 },
        },
        required: ['metric', 'from', 'to'],
      },
    },
  },
  // ...8 more
];

const HANDLERS = {
  get_top_products: async ({ metric, from, to, limit }) => {
    if (metric === 'revenue') return saleModel.getTopByRevenue(from, to, limit);
    if (metric === 'qty')     return saleModel.getTopByQty(from, to, limit);
    if (metric === 'profit')  return saleModel.getProfitByProduct(from, to, limit);
    throw new Error('Unknown metric: ' + metric);
  },
  // ...
};

module.exports = { TOOLS, HANDLERS };
```

The assistant loop becomes:

```js
async function askWithTools(systemPrompt, history, userMessage, opts) {
  const messages = [{ role: 'system', content: systemPrompt },
                    ...history, { role: 'user', content: userMessage }];
  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const r = await groq.getCompletion(messages, { tools: TOOLS });
    if (!r.toolCalls?.length) return r;          // done
    messages.push({ role: 'assistant', content: null, tool_calls: r.toolCalls });
    for (const call of r.toolCalls) {
      const fn = HANDLERS[call.function.name];
      const result = fn ? await fn(JSON.parse(call.function.arguments))
                        : { error: 'unknown tool' };
      messages.push({ role: 'tool', tool_call_id: call.id,
                      content: JSON.stringify(result) });
    }
  }
  throw new Error('tool loop exceeded');
}
```

Effort estimate:
- `ai/tools.js` + schemas: ~150 LOC
- Update `ai/providers/groq.js` to forward `tools` param + parse tool_calls: ~30 LOC
- Update `ai/assistant.js` with the loop: ~50 LOC
- Logging in `ai_query_log` for each tool round: ~20 LOC + maybe a new column
- Frontend UX hint ("🔍 Checking last 7 days of sales…" pills): ~40 LOC
- Tests + tuning: ~half a day

Realistic: **1-2 days of focused work**, not the "~30 min" some of the
other patches in this session were.

## 8. Cost analysis

| | Today (dump-context) | Tool-calling |
|---|---|---|
| Tokens per simple Q ("my utang?") | ~700 in + 100 out | ~250 in + 80 out (one tool round) |
| Tokens per complex Q ("Bear Brand last week vs this") | ~700 in + 150 out, but answer is "wala data" | ~600 in + 200 out (2-3 tool rounds), correct answer |
| Wall-clock simple Q | 800-1500 ms | 1000-2000 ms (extra round-trip) |
| Wall-clock complex Q | 800 ms but useless | 2500-4000 ms but correct |
| Code complexity | ~50 LOC of compose | ~300 LOC of compose + loop + handlers |
| Maintenance | low (just SQL) | medium (tool schemas + LLM tuning) |

Net cost-per-query is probably **flat to slightly negative** because
simple questions get cheaper. The cost driver is complexity, not tokens.

## 9. When does this become the right move?

Three signals from `ai_query_log` would tell us we should do it now:

1. **Refusal rate above 15%.** Query the log for responses containing
   "wala pa akong sapat na data" / "I don't have enough information"
   etc. If owners are hitting that wall regularly, the data is in the
   DB but not in the context window — exactly the gap tool-calling fixes.
2. **A pattern of "specific date" or "specific product" questions.**
   `SELECT question_preview FROM ai_query_log WHERE endpoint='chat'`
   over a month would reveal whether owners actually ask the kind of
   questions tool-calling unlocks, or whether they keep asking
   "kumusta?" and "magkano sales ko?".
3. **Token budget bottleneck.** If we ever want to add more to the
   context block (e.g., last-7-days breakdown alongside 30-day) and
   we're brushing against Groq's prompt limits or paying noticeably
   more.

Without those signals, tool-calling is **building capability we don't
need yet**.

## 10. Recommendation

**Defer.** Three reasons:

1. The current dump-context flow correctly answers the questions Os
   was verified against this session. The "wrong data" complaint that
   started the audit turned out to be polluted seed data + structural
   bugs in the aggregations, not a context-shape problem.
2. We just shipped `ai_query_log`. Wait 2-4 weeks, run the refusal-rate
   + question-pattern queries, then revisit with evidence.
3. The next bigger UX win — provenance citations on AI answers ("based
   on data from Apr 27 – May 26"), better empty-state guidance, server-
   side user preference sync for the language pill — costs less and
   has clearer value.

If a tool-calling experiment *is* warranted later, the smallest useful
scope is probably 3 tools (`get_top_products`, `get_sales_summary`,
`get_day_of_week_stats`) on `/chat` only, behind a feature flag that
falls back to dump-context. Don't replace, augment.

## 11. Open questions for the next planning session

- Do we want streaming + tool-calling simultaneously? (Groq supports
  both, but mixing them is fiddly.)
- Should the tool layer enforce a per-tool rate limit, or piggyback on
  the existing per-user limit?
- How do we represent tool calls in the chat history that's
  sessionStorage'd on the client? Today the client only knows
  user/assistant turns.
- Provenance UI: when the LLM calls `get_top_products(from='2026-04-01',
  to='2026-04-30')`, do we surface that to the user as "🔍 Checking
  April sales…" the way Perplexity does?

## 12. References to current code

- Context dump: `ai/context-builder.js:15-39` (fetch), `41-119` (build)
- Provider call: `ai/providers/groq.js:4-39`
- Cache: `ai/assistant.js:9-22`
- System prompt: `ai/prompts/system.js:22-37`
- Endpoint wiring: `backend/controllers/ai.controller.js` (after recent
  audit-log + daily-brief refactors)
- Query log table (used to inform §9 thresholds): `database/schema.sql`,
  table `ai_query_log`
