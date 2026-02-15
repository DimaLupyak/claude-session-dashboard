# Design: Cost Estimation & Account Settings

## 1. Problem Statement

The Claude Session Dashboard shows token usage per session but provides no cost insight. Users have no way to understand how much a session cost in dollar terms. This feature adds:

1. **Cost estimation** -- calculates estimated USD cost from token usage and per-model pricing
2. **Settings persistence** -- a `~/.claude-dashboard/settings.json` file for user preferences (pricing overrides, subscription tier)
3. **Settings page** -- UI for editing pricing and subscription configuration

## 2. Key Decisions

### 2.1 Pricing Source: Hardcoded Defaults with User Overrides

Default prices are hardcoded from official Anthropic API pricing (source: platform.claude.com/docs/en/about-claude/pricing). Users can override any model's pricing via the settings page. Auto-parsing from the Anthropic website is P2 (out of scope).

### 2.2 Subscription Tiers: Informational Labels Only

Claude Code subscription tiers (Free, Pro, Max 5x, Max 20x, Teams, Enterprise) do NOT change per-token API pricing. Subscription costs are flat monthly fees. The dashboard tracks which tier the user is on for display context (e.g., "You're on Pro ($20/mo)") but does NOT apply multipliers to token costs. API pricing is the same regardless of subscription tier.

### 2.3 Storage Location: `~/.claude-dashboard/settings.json`

A dedicated directory `~/.claude-dashboard/` avoids polluting `~/.claude/` (which the dashboard must never modify). The JSON file stores pricing overrides and user preferences. The directory is created on first write if it does not exist.

### 2.4 Per-Model Token Tracking: Enhancement to Session Parser

The current `SessionDetail.totalTokens` is a single aggregate `TokenUsage`. For accurate per-model cost estimation, we need per-model token breakdowns. The parser will be enhanced to track `tokensByModel: Record<string, TokenUsage>` alongside the existing aggregate.

## 3. Data Model

### 3.1 Model Pricing Schema

```
ModelPricing {
  modelId: string              // e.g. "claude-opus-4-6"
  displayName: string          // e.g. "Claude Opus 4.6"
  inputPerMTok: number         // USD per million input tokens
  outputPerMTok: number        // USD per million output tokens
  cacheReadPerMTok: number     // USD per million cache read tokens
  cacheWritePerMTok: number    // USD per million cache write tokens (5-min)
}
```

### 3.2 Default Pricing Table

All prices in USD per million tokens, sourced from Anthropic's official pricing page:

| Model ID | Display Name | Input | Output | Cache Read | Cache Write (5m) |
|----------|-------------|-------|--------|------------|-----------------|
| claude-opus-4-6 | Claude Opus 4.6 | $5.00 | $25.00 | $0.50 | $6.25 |
| claude-opus-4-5 | Claude Opus 4.5 | $5.00 | $25.00 | $0.50 | $6.25 |
| claude-opus-4-1 | Claude Opus 4.1 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-opus-4 | Claude Opus 4 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude-sonnet-4-5 | Claude Sonnet 4.5 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-sonnet-4 | Claude Sonnet 4 | $3.00 | $15.00 | $0.30 | $3.75 |
| claude-haiku-4-5 | Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | $1.25 |
| claude-haiku-3-5 | Claude Haiku 3.5 | $0.80 | $4.00 | $0.08 | $1.00 |
| claude-haiku-3 | Claude Haiku 3 | $0.25 | $1.25 | $0.03 | $0.30 |

Note: The model IDs logged in session JSONL files use the format `claude-sonnet-4-20250514` (with date suffix). The cost calculation must normalize model IDs by stripping date suffixes to match against the pricing table.

### 3.3 Subscription Tier Schema

```
SubscriptionTier {
  id: "free" | "pro" | "max-5x" | "max-20x" | "teams" | "enterprise" | "api"
  displayName: string
  monthlyUSD: number | null   // null for enterprise/api
}
```

Default tiers:

| ID | Display Name | Monthly USD |
|----|-------------|-------------|
| free | Free | $0 |
| pro | Pro | $20 |
| max-5x | Max 5x | $100 |
| max-20x | Max 20x | $200 |
| teams | Teams | $150 |
| enterprise | Enterprise | null |
| api | API Only | null |

### 3.4 Settings File Format

Path: `~/.claude-dashboard/settings.json`

```
{
  "version": 1,
  "subscriptionTier": "pro",
  "pricingOverrides": {
    "claude-sonnet-4": {
      "inputPerMTok": 3.00,
      "outputPerMTok": 15.00,
      "cacheReadPerMTok": 0.30,
      "cacheWritePerMTok": 3.75
    }
  },
  "updatedAt": "2026-02-12T10:30:00.000Z"
}
```

- `version`: Schema version for forward compatibility
- `subscriptionTier`: Selected tier ID
- `pricingOverrides`: Sparse map -- only contains models the user has explicitly customized. Missing models use hardcoded defaults.
- `updatedAt`: ISO timestamp of last save

### 3.5 Zod Schemas

```
ModelPricingOverrideSchema = z.object({
  inputPerMTok: z.number().min(0),
  outputPerMTok: z.number().min(0),
  cacheReadPerMTok: z.number().min(0),
  cacheWritePerMTok: z.number().min(0),
})

SettingsSchema = z.object({
  version: z.literal(1),
  subscriptionTier: z.enum([
    "free", "pro", "max-5x", "max-20x",
    "teams", "enterprise", "api"
  ]).default("pro"),
  pricingOverrides: z.record(z.string(), ModelPricingOverrideSchema).default({}),
  updatedAt: z.string().datetime().optional(),
})
```

### 3.6 Per-Model Token Tracking (Parser Enhancement)

New field added to `SessionDetail`:

```
tokensByModel: Record<string, TokenUsage>
```

Where each key is the raw model string from the JSONL (e.g. `"claude-sonnet-4-20250514"`) and the value is the cumulative `TokenUsage` for that model within the session.

## 4. Architecture

### 4.1 High-Level Data Flow

```
~/.claude-dashboard/settings.json     ~/.claude/projects/**/*.jsonl
          |                                      |
          v                                      v
 +-------------------+               +------------------------+
 | settings.server.ts|               | session-parser.ts      |
 | getSettings()     |               | parseDetail() enhanced |
 | saveSettings()    |               | -> tokensByModel       |
 +-------------------+               +------------------------+
          |                                      |
          v                                      v
 +-------------------+               +------------------------+
 | settings.queries  |               | session-detail.queries |
 | settingsQuery     |               | sessionDetailQuery     |
 +-------------------+               +------------------------+
          |                                      |
          +------------------+-------------------+
                             |
                             v
                  +------------------------+
                  | Cost Calculation (pure) |
                  | calculateSessionCost() |
                  +------------------------+
                             |
               +-------------+-------------+
               |                           |
               v                           v
     +------------------+       +---------------------+
     | CostSummaryLine  |       | CostEstimationPanel |
     | (inline in token |       | (dedicated card)    |
     | section)         |       |                     |
     +------------------+       +---------------------+
```

### 4.2 Settings Read/Write Flow

```
[Settings Page]
      |
      | (load)
      v
useQuery(settingsQuery)
      |
      v
getSettings() -- server function
      |
      +-- Read ~/.claude-dashboard/settings.json
      +-- If not found: return defaults
      +-- Parse with Zod, merge with defaults
      |
      v
[Form displays merged pricing table]
      |
      | (save)
      v
useMutation -> saveSettings()
      |
      +-- Validate with Zod
      +-- Ensure ~/.claude-dashboard/ exists (mkdir -p)
      +-- Write JSON atomically (write to .tmp, rename)
      +-- Return saved settings
      |
      v
invalidateQueries(['settings'])
```

### 4.3 Cost Calculation Flow (Pure Functions)

```
calculateSessionCost(
  tokensByModel: Record<string, TokenUsage>,
  pricingTable: Record<string, ModelPricing>
): CostBreakdown

Where CostBreakdown = {
  totalUSD: number
  byModel: Record<string, {
    modelId: string
    displayName: string
    inputCost: number
    outputCost: number
    cacheReadCost: number
    cacheWriteCost: number
    totalCost: number
    tokens: TokenUsage
  }>
  byCategory: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
}
```

Cost formula per model:

```
inputCost     = (inputTokens / 1_000_000) * inputPerMTok
outputCost    = (outputTokens / 1_000_000) * outputPerMTok
cacheReadCost = (cacheReadInputTokens / 1_000_000) * cacheReadPerMTok
cacheWriteCost = (cacheCreationInputTokens / 1_000_000) * cacheWritePerMTok
```

Model ID normalization: strip date suffix using regex `/-\d{8}$/` (e.g., `claude-sonnet-4-20250514` becomes `claude-sonnet-4`). If the normalized ID is not found in the pricing table, fall back to the closest matching model by prefix, or use Sonnet 4 pricing as the ultimate fallback.

## 5. Feature Slices

### 5.1 `features/settings/` (New Slice)

```
features/settings/
  settings.server.ts       -- getSettings, saveSettings server functions
  settings.queries.ts      -- settingsQuery, useSettingsMutation
  settings.types.ts        -- Zod schemas, TypeScript types, default pricing
  SettingsPage.tsx          -- Main settings page component
  PricingTableEditor.tsx   -- Editable pricing table component
  TierSelector.tsx         -- Subscription tier radio/select
```

### 5.2 `features/cost-estimation/` (New Slice)

```
features/cost-estimation/
  cost-calculator.ts       -- Pure calculation functions (no I/O)
  cost-estimation.types.ts -- CostBreakdown type, helper types
  CostEstimationPanel.tsx  -- Dedicated breakdown card
  CostSummaryLine.tsx      -- Inline one-line cost display
  useSessionCost.ts        -- Hook: combines settings query + tokens -> cost
```

## 6. File Plan

### 6.1 New Files

| File | Purpose |
|------|---------|
| `features/settings/settings.types.ts` | Zod schemas (ModelPricingOverrideSchema, SettingsSchema), TypeScript types, DEFAULT_PRICING constant, SUBSCRIPTION_TIERS constant, model ID normalization helper |
| `features/settings/settings.server.ts` | `getSettings()` and `saveSettings()` server functions. Reads/writes `~/.claude-dashboard/settings.json`. Creates directory if needed. |
| `features/settings/settings.queries.ts` | `settingsQuery` (queryOptions, 5-min stale), `useSettingsMutation` (saves + invalidates) |
| `features/settings/SettingsPage.tsx` | Full page: tier selector, pricing table editor, reset-to-defaults button |
| `features/settings/PricingTableEditor.tsx` | Table of model pricing with inline editable number inputs. Shows default vs. overridden (visual indicator). |
| `features/settings/TierSelector.tsx` | Radio group or select for subscription tier. Shows tier name + monthly price. |
| `features/cost-estimation/cost-calculator.ts` | Pure functions: `calculateSessionCost()`, `normalizeModelId()`, `getMergedPricing()` |
| `features/cost-estimation/cost-estimation.types.ts` | `CostBreakdown`, `ModelCostBreakdown`, `CategoryCosts` types |
| `features/cost-estimation/CostEstimationPanel.tsx` | Card showing per-model cost table + category breakdown (input/output/cache) + visual bar |
| `features/cost-estimation/CostSummaryLine.tsx` | Compact one-liner: "~$0.42 estimated" with optional tooltip breakdown |
| `features/cost-estimation/useSessionCost.ts` | Hook: `useSessionCost(tokensByModel)` returns `CostBreakdown`. Internally queries settings and runs pure calculation. |
| `routes/_dashboard/settings.tsx` | Route file for `/settings` page |

### 6.2 Modified Files

| File | Changes |
|------|---------|
| `lib/parsers/types.ts` | Add `tokensByModel: Record<string, TokenUsage>` to `SessionDetail` interface |
| `lib/parsers/session-parser.ts` | Track tokens per model ID during `parseDetail()`. Populate `tokensByModel` alongside existing `totalTokens`. |
| `routes/_dashboard/sessions/$sessionId.tsx` | Import and render `CostEstimationPanel` in the stats grid. Import and render `CostSummaryLine` in the header metadata. |
| `components/AppShell.tsx` | Add "Settings" nav item with gear icon to sidebar `NAV_ITEMS` |
| `lib/utils/format.ts` | Add `formatUSD(amount: number): string` function (e.g., "$0.42", "<$0.01") |

### 6.3 NOT Modified (Intentionally)

| File | Reason |
|------|--------|
| `features/sessions/SessionCard.tsx` | Cost per session in the list is a P2 enhancement. Requires running cost calc per session (needs per-model tokens from summary parse which is expensive). Deferred. |
| `features/sessions/sessions.server.ts` | No changes to session list server functions |
| `features/stats/` | Stats page cost totals are a P2 enhancement |
| `lib/parsers/session-parser.ts` (`parseSummary`) | Summary parse only reads head/tail lines; not enough data for accurate per-model cost. Leave unchanged. |

## 7. Route Structure

New route: `/_dashboard/settings`

```
routes/
  _dashboard/
    sessions/
      index.tsx          (existing)
      $sessionId.tsx     (existing, modified)
    stats.tsx            (existing)
    settings.tsx         (NEW)
```

The route tree generator will auto-add the settings route. The `_dashboard` layout wraps it with `AppShell`.

## 8. Component Design

### 8.1 CostSummaryLine

Renders inline in the session detail header, next to duration/turns/model badges:

```
<span class="text-xs text-emerald-400 font-mono">~$0.42</span>
```

- Shows nothing if no token data or settings fail to load
- Uses `~` prefix to indicate estimate
- Tooltip on hover: "Estimated cost based on API pricing"

### 8.2 CostEstimationPanel

Full breakdown card placed in the stats grid (alongside ContextWindowPanel and ToolUsagePanel):

```
+-----------------------------------------------+
| Cost Estimation               ~$0.42 total     |
|-----------------------------------------------|
| By Category                                    |
|   Input tokens      $0.15                      |
|   Output tokens     $0.22                      |
|   Cache read        $0.03                      |
|   Cache write       $0.02                      |
|   [====input====][==output==][cr][cw]          |
|-----------------------------------------------|
| By Model                                       |
|   sonnet-4           $0.38  (90%)              |
|   haiku-4-5          $0.04  (10%)              |
+-----------------------------------------------+
```

- Dark theme card matching existing panels (`rounded-xl border border-gray-800 bg-gray-900/50 p-4`)
- Category breakdown with color-coded visual bar
- Per-model breakdown sorted by cost descending
- Shows "Configure pricing" link to /settings if user might want to adjust
- Graceful empty state: "No token data" if tokensByModel is empty

### 8.3 SettingsPage

```
+-----------------------------------------------+
| Settings                                       |
|-----------------------------------------------|
| Subscription Tier                              |
| ( ) Free        ( ) Pro ($20/mo)               |
| ( ) Max 5x      ( ) Max 20x                   |
| ( ) Teams       ( ) Enterprise                 |
| ( ) API Only                                   |
|-----------------------------------------------|
| API Pricing (per million tokens)               |
|                                                |
| Model          | Input | Output | CacheR | CW  |
| Opus 4.6       | 5.00  | 25.00  | 0.50   |6.25 |
| Opus 4.5       | 5.00  | 25.00  | 0.50   |6.25 |
| Sonnet 4.5     | 3.00  | 15.00  | 0.30   |3.75 |
| Sonnet 4       | 3.00  | 15.00  | 0.30   |3.75 |
| Haiku 4.5      | 1.00  |  5.00  | 0.10   |1.25 |
| Haiku 3.5      | 0.80  |  4.00  | 0.08   |1.00 |
|                                                |
| [Reset to Defaults]              [Save]        |
|                                                |
| * Overridden values shown in blue              |
+-----------------------------------------------+
```

- Number inputs with step="0.01" for each cell
- Overridden values get a visual indicator (blue text or highlight)
- Reset to Defaults clears all overrides
- Save button triggers mutation, shows success toast/indicator
- Form state managed with React useState (no form library needed)
- Optimistic update via React Query's onMutate

### 8.4 useSessionCost Hook

```typescript
function useSessionCost(tokensByModel: Record<string, TokenUsage>): {
  cost: CostBreakdown | null
  isLoading: boolean
}
```

- Queries settings via `settingsQuery` (cached, rarely refetches)
- Merges default pricing with user overrides
- Calls pure `calculateSessionCost()` function
- Returns null while settings are loading
- Memoizes result based on tokensByModel + settings

## 9. Session Detail Page Integration

The session detail page (`$sessionId.tsx`) stats grid changes from a 2-column grid to a responsive layout accommodating the new cost panel:

```
Current:
  [ContextWindowPanel] [ToolUsagePanel]

Proposed:
  [ContextWindowPanel] [CostEstimationPanel]
  [ToolUsagePanel]     (spans or fills)
```

Alternatively, keep the 2-column grid and add a third row:

```
  [ContextWindowPanel] [ToolUsagePanel]
  [CostEstimationPanel]
```

Decision: Add CostEstimationPanel as a third panel below the existing two. This avoids reshuffling the layout and the cost panel can span full width or sit in a 2-col grid depending on content.

```tsx
{/* Stats grid */}
<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
  <ContextWindowPanel ... />
  <ToolUsagePanel ... />
</div>

{/* Cost estimation */}
<div className="mt-4">
  <CostEstimationPanel tokensByModel={detail.tokensByModel} />
</div>
```

The `CostSummaryLine` goes in the header metadata row:

```tsx
<div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
  {detail.branch && <span className="font-mono">{detail.branch}</span>}
  {startedAt && <span>{formatDateTime(startedAt)}</span>}
  <span>{formatDuration(durationMs)}</span>
  <span>{detail.turns.length} turns</span>
  <CostSummaryLine tokensByModel={detail.tokensByModel} />
</div>
```

## 10. Session Parser Enhancement

In `parseDetail()` within `session-parser.ts`, add per-model token tracking:

```
// New accumulator alongside totalTokens:
const tokensByModel: Record<string, TokenUsage> = {}

// Inside the assistant message handler, where model and usage exist:
if (msg.message.model && msg.message.usage) {
  const modelId = msg.message.model
  const existing = tokensByModel[modelId] ?? {
    inputTokens: 0, outputTokens: 0,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
  }
  existing.inputTokens += tokens.inputTokens
  existing.outputTokens += tokens.outputTokens
  existing.cacheReadInputTokens += tokens.cacheReadInputTokens
  existing.cacheCreationInputTokens += tokens.cacheCreationInputTokens
  tokensByModel[modelId] = existing
}
```

Return `tokensByModel` in the `SessionDetail` result. This is additive -- the existing `totalTokens` field remains unchanged for backward compatibility.

## 11. Model ID Normalization

Claude session JSONL files log model IDs with date suffixes like `claude-sonnet-4-20250514`. The pricing table uses base IDs like `claude-sonnet-4`. The normalization function:

```
normalizeModelId(raw: string): string
  1. Strip date suffix: raw.replace(/-\d{8}$/, '')
  2. Return normalized string

Examples:
  "claude-sonnet-4-20250514"  -> "claude-sonnet-4"
  "claude-opus-4-6-20260101"  -> "claude-opus-4-6"
  "claude-haiku-3-5-20241022" -> "claude-haiku-3-5"
  "claude-sonnet-4"           -> "claude-sonnet-4" (no change)
```

The `getMergedPricing()` function:

```
getMergedPricing(settings: Settings): Record<string, ModelPricing>
  1. Start with DEFAULT_PRICING (hardcoded table)
  2. For each entry in settings.pricingOverrides, merge into defaults
  3. Return complete pricing table
```

## 12. formatUSD Utility

New function in `lib/utils/format.ts`:

```
formatUSD(amount: number): string
  - amount < 0.005  -> "<$0.01"
  - amount < 1      -> "$X.XX"     (2 decimal places)
  - amount < 100    -> "$X.XX"     (2 decimal places)
  - amount >= 100   -> "$X"        (0 decimal places)
  - Handles NaN/Infinity -> "$0.00"
```

## 13. Settings Server Functions

### getSettings

```
getSettings: createServerFn({ method: 'GET' })
  1. Compute path: path.join(os.homedir(), '.claude-dashboard', 'settings.json')
  2. If file does not exist: return default settings object
  3. Read file, parse JSON
  4. Validate with SettingsSchema.safeParse()
  5. If validation fails: return defaults (don't crash on corrupt file)
  6. Return validated settings
```

### saveSettings

```
saveSettings: createServerFn({ method: 'POST' })
  .inputValidator(SettingsSchema)
  1. Validate input with Zod
  2. Set updatedAt to current ISO timestamp
  3. Compute dir: path.join(os.homedir(), '.claude-dashboard')
  4. Ensure directory exists: fs.mkdirSync(dir, { recursive: true })
  5. Write to temp file: path.join(dir, 'settings.json.tmp')
  6. Rename temp to final: fs.renameSync(tmp, final)
  7. Return saved settings
```

The atomic write (write tmp + rename) prevents corruption if the process is interrupted mid-write.

## 14. Query Configuration

### settingsQuery

```
queryKey: ['settings']
staleTime: 300_000  (5 minutes -- settings rarely change)
refetchOnWindowFocus: false
```

### useSettingsMutation

```
mutationFn: saveSettings
onSuccess: invalidateQueries({ queryKey: ['settings'] })
```

## 15. Navigation Update

In `AppShell.tsx`, add Settings to the sidebar:

```
const NAV_ITEMS = [
  { to: '/sessions', label: 'Sessions', icon: '>' },
  { to: '/stats', label: 'Stats', icon: '#' },
  { to: '/settings', label: 'Settings', icon: '*' },
] as const
```

Settings is positioned last as it is a utility page, not a primary view.

## 16. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Model ID normalization misses new format | Medium | Fallback to closest prefix match, then Sonnet 4 pricing. Log a console warning for unknown models. |
| `~/.claude-dashboard/` write permission denied | Low | Server function catches EACCES/EPERM, returns meaningful error. UI shows "Unable to save settings" with the error. Settings still work in read-only mode with defaults. |
| Corrupt settings.json | Low | `safeParse()` with Zod. Falls back to defaults on any parse failure. Does not overwrite the corrupt file until user explicitly saves. |
| Cost estimates diverge from actual billing | Medium | Clearly label all costs as "~estimated". Add "Based on API pricing, actual costs may vary" disclaimer in the CostEstimationPanel. |
| Per-model token tracking increases parser memory | Low | `tokensByModel` is a small Record (typically 1-3 models per session). Negligible memory overhead. |
| Settings file location conflicts with other tools | Low | Using `~/.claude-dashboard/` (not `~/.claude/`) avoids conflicts. This directory is owned entirely by this dashboard. |
| Stale settings after external edit | Low | 5-minute stale time on settings query. User can refresh page. Not expected to be externally edited. |
| Race condition: two tabs save settings simultaneously | Low | Last-write-wins is acceptable for a single-user local app. Atomic rename prevents corruption. |

## 17. Testing Strategy

### Unit Tests (cost-calculator.ts)
- `calculateSessionCost` with single model, multiple models, zero tokens, unknown model
- `normalizeModelId` with various date suffix formats
- `getMergedPricing` with no overrides, partial overrides, full overrides
- Edge cases: empty tokensByModel, NaN values, negative tokens

### Unit Tests (settings.types.ts)
- Zod schema validation: valid settings, missing fields, invalid tier, negative prices
- Default merging logic

### Integration (manual)
- Settings page: load defaults, edit pricing, save, reload page and verify persistence
- Session detail: verify cost shows for sessions with token data
- Session detail: verify cost updates when settings change

## 18. Future Enhancements (P2, Out of Scope)

1. **Cost per session in list view** -- Requires per-model tokens from summary parse (currently reads only head/tail lines, insufficient for full token tracking). Would need a lightweight cost cache.
2. **Stats page total cost** -- Aggregate cost across all sessions using stats-cache.json modelUsage data.
3. **Auto-fetch pricing from Anthropic** -- Scrape or fetch pricing from Anthropic's pricing page with user consent.
4. **Batch API pricing toggle** -- Option to calculate with 50% batch discount.
5. **Cost trends chart** -- Daily/weekly cost trends using stats data.
6. **Budget alerts** -- Warn when estimated monthly cost exceeds a threshold.
7. **Long context pricing** -- Detect when sessions exceed 200K input tokens and apply premium rates.
