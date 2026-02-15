# Design: BRANDING-OVERHAUL -- Claude Brand Styling, Header, and Favicon

## 1. Problem Statement

The dashboard uses a generic dark theme with blue accents that does not visually align with the Claude/Anthropic brand. There is no favicon, no external links to the project's GitHub or npm pages, and the header is minimal. This design overhauls the color palette, header, and meta assets to align with Claude's warm terracotta brand identity while preserving the dark-first developer dashboard aesthetic.

### Goals

1. Replace blue accent color (`blue-400`/`blue-500`) with Claude's terracotta/rust (`#d97757`) across all UI
2. Warm up neutral grays to complement the terracotta accent
3. Redesign the sidebar header with a branded logo mark, GitHub and npm links
4. Add an SVG favicon using a Google Material Symbols icon
5. Maintain data visualization readability (charts, badges, heatmap)

---

## 2. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Keep dark theme, swap accent to terracotta | User chose Option A; preserves developer-friendly dark aesthetic while aligning with Claude brand |
| Warm grays via CSS custom properties | Tailwind v4 CSS-first config makes it easy to define warm gray overrides in `app.css`; avoids a Tailwind plugin |
| Keep semantic colors (emerald for active, amber for cache, red for error) | These convey meaning; swapping them would reduce clarity |
| Replace blue accent everywhere, including charts | Full palette overhaul scope as requested; first COLORS entry in charts becomes terracotta |
| Heatmap shifts from blue intensity to terracotta intensity | Aligns heatmap with new brand; terracotta intensity scale is still visually distinguishable |
| Tool category colors in timeline stay distinct | Read/Write/Bash/Task etc. keep their unique colors for semantic meaning; only the "blue = Read" category shifts to terracotta |
| SVG favicon embedded as inline data URI | Zero external dependencies; works offline; uses Google Material Symbols "terminal" icon |
| GitHub and npm links use inline SVG icons in sidebar header | No icon library dependency; just two small SVG paths |
| npm URL derived from package name: `https://www.npmjs.com/package/claude-session-dashboard` | Matches `package.json` name field |

---

## 3. Color Palette

### 3.1 Accent Color Migration (blue -> terracotta)

The Claude brand terracotta is `#d97757` (close to Tailwind's `orange-500`). We define a custom `brand` color scale for precise control.

| Old Token | Old Value | New Token | New Value | Usage |
|-----------|-----------|-----------|-----------|-------|
| `blue-400` | `#60a5fa` | `brand-400` | `#e09070` | Links, input tokens, active text |
| `blue-500` | `#3b82f6` | `brand-500` | `#d97757` | Primary accent, fills, chart bars |
| `blue-600` | `#2563eb` | `brand-600` | `#c4643f` | Active states (toggles, pagination) |
| `blue-700` | `#1d4ed8` | `brand-700` | `#a8512e` | Heatmap mid intensity |
| `blue-300` | `#93c5fd` | `brand-300` | `#f0b8a0` | Tool usage bar text |
| `#3b82f6` hex | -- | `#d97757` hex | -- | Recharts fills, gradients |
| `#60a5fa` hex | -- | `#e09070` hex | -- | Timeline tool colors |
| `#6366f1` (indigo) | -- | `#b07cc5` (muted purple) | -- | 6th chart color slot (was too close to blue) |
| `rgba(59,130,246,...)` | -- | `rgba(217,119,87,...)` | -- | HourlyDistribution bar opacity |

### 3.2 Warm Gray Migration

Shift from Tailwind's cool gray (blue undertone) to warm gray (brown/amber undertone). Defined as CSS custom properties consumed by Tailwind v4.

| Old Tailwind | Old Hex | New CSS Variable | New Hex | Notes |
|--------------|---------|------------------|---------|-------|
| `gray-950` | `#030712` | `--color-surface-950` | `#141413` | Body bg (matches Claude dark bg) |
| `gray-900` | `#111827` | `--color-surface-900` | `#1c1c1a` | Card/panel backgrounds |
| `gray-800` | `#1f2937` | `--color-surface-800` | `#2a2926` | Borders, dividers, tracks |
| `gray-700` | `#374151` | `--color-surface-700` | `#3d3b36` | Subtle fills, inactive bars |
| `gray-600` | `#4b5563` | `--color-surface-600` | `#565349` | Disabled states |
| `gray-500` | `#6b7280` | `--color-surface-500` | `#7a7668` | Muted text |
| `gray-400` | `#9ca3af` | `--color-surface-400` | `#a39e90` | Secondary text |
| `gray-300` | `#d1d5db` | `--color-surface-300` | `#cdc8b8` | Headings, labels |
| `gray-200` | `#e5e7eb` | `--color-surface-200` | `#e0dbd0` | Hover text |
| `gray-100` | `#f3f4f6` | `--color-surface-100` | `#eae6dc` | Primary text |

**Implementation approach**: Rather than replacing all 200+ `gray-*` class usages, we redefine Tailwind's gray scale in `app.css` using `@theme`. This is the Tailwind v4 way and means zero changes to class names in component files.

```css
@import 'tailwindcss';

@theme {
  /* Warm gray overrides */
  --color-gray-50: #f5f3ec;
  --color-gray-100: #eae6dc;
  --color-gray-200: #e0dbd0;
  --color-gray-300: #cdc8b8;
  --color-gray-400: #a39e90;
  --color-gray-500: #7a7668;
  --color-gray-600: #565349;
  --color-gray-700: #3d3b36;
  --color-gray-800: #2a2926;
  --color-gray-900: #1c1c1a;
  --color-gray-950: #141413;

  /* Brand accent (terracotta) */
  --color-brand-300: #f0b8a0;
  --color-brand-400: #e09070;
  --color-brand-500: #d97757;
  --color-brand-600: #c4643f;
  --color-brand-700: #a8512e;
}
```

This means every existing `bg-gray-800`, `text-gray-400`, etc. automatically uses the warm gray without touching any component file for the gray migration. Only `blue-*` -> `brand-*` class name swaps are needed.

### 3.3 Semantic Colors (UNCHANGED)

These retain their current values because they convey meaning:

| Token | Value | Usage | Change? |
|-------|-------|-------|---------|
| `emerald-400` | `#34d399` | Active status, output tokens, cost | No |
| `emerald-500` | `#10b981` | Active dot, chart "Sessions" | No |
| `amber-400` | `#fbbf24` | Cache tokens, Bash tool color | No |
| `amber-500` | `#f59e0b` | Autocompact warning | No |
| `purple-400` | `#c084fc` | Cache creation, Task tool | No |
| `purple-500` | `#a855f7` | System overhead | No |
| `red-400` | `#f87171` | Error, limit reference line | No |
| `green-400/500` | `#4ade80/#22c55e` | Active session badge | No |

### 3.4 Chart COLORS Array Update

```
Old: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1']
New: ['#d97757', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#b07cc5']
```

Slot 0 changes from blue to brand terracotta. Slot 5 changes from indigo (`#6366f1`, too close to slot 1 purple) to a muted orchid (`#b07cc5`) for better differentiation.

### 3.5 Heatmap Intensity Colors

```
Old: ['#1f2937', '#1e3a5f', '#1d4ed8b3', '#3b82f6cc', '#60a5fa']
New: ['#2a2926', '#3d2a1e', '#a8512eb3', '#d97757cc', '#e09070']
```

Warm gray base, dark terracotta low, terracotta mid, bright terracotta high.

### 3.6 Recharts Tooltip/Grid Hex Updates

| Context | Old Hex | New Hex |
|---------|---------|---------|
| CartesianGrid stroke | `#1f2937` | `#2a2926` |
| Axis tick fill | `#6b7280` | `#7a7668` |
| Tooltip bg | `#111827` | `#1c1c1a` |
| Tooltip border | `#374151` | `#3d3b36` |
| Context sparkline stroke | `#3b82f6` | `#d97757` |
| Context sparkline gradient | `#3b82f6` | `#d97757` |
| HourlyDistribution rgba base | `rgba(59, 130, 246, ...)` | `rgba(217, 119, 87, ...)` |
| ActivityChart "Messages" fill | `#3b82f6` | `#d97757` |

---

## 4. Header/Sidebar Redesign

### 4.1 Current State

```
+----------------------------+
| [Claude] Dashboard         |  <- h-14, border-b, text link to /sessions
+----------------------------+
| > Sessions     [2]         |
| # Stats                    |
| * Settings                 |
+----------------------------+
| Read-only observer         |
+----------------------------+
```

Logo text uses `<span class="text-blue-400">Claude</span> Dashboard`.
Navigation icons are plain ASCII characters (`>`, `#`, `*`).

### 4.2 New Design

```
+-----------------------------------+
|  [=] Claude Dashboard        v0.2 |  <- Logo icon + text + version badge
+-----------------------------------+
|  [>] Sessions            [2]      |  <- Proper SVG nav icons
|  [#] Stats                        |
|  [*] Settings                     |
+-----------------------------------+
|                                   |
|  (spacer)                         |
|                                   |
+-----------------------------------+
|  [GH] [npm]    Read-only observer |  <- Footer with links + observer tag
+-----------------------------------+
```

#### 4.2.1 Logo Area (top)

- Replace `<span class="text-blue-400">Claude</span>` with `<span class="text-brand-400">Claude</span>`
- Add a small version badge: `<span class="text-[10px] text-gray-500">v0.2</span>` pulled from `package.json` version or hardcoded
- Keep the `Link to="/sessions"` behavior

#### 4.2.2 Navigation Icons

Replace ASCII characters with simple inline SVG icons for a more polished look:
- Sessions: list/queue icon (3 horizontal lines with dots)
- Stats: bar chart icon
- Settings: gear/cog icon

Each icon is a 16x16 SVG rendered inline. This avoids any icon library dependency.

#### 4.2.3 Footer Area (bottom)

The current footer only shows "Read-only observer". Redesign:

```tsx
<div className="border-t border-gray-800 p-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <a href="https://github.com/dlupiak/claude-session-dashboard"
         target="_blank" rel="noopener noreferrer"
         className="text-gray-500 hover:text-gray-300 transition-colors"
         title="GitHub Repository">
        {/* GitHub SVG icon 16x16 */}
      </a>
      <a href="https://www.npmjs.com/package/claude-session-dashboard"
         target="_blank" rel="noopener noreferrer"
         className="text-gray-500 hover:text-gray-300 transition-colors"
         title="npm Package">
        {/* npm SVG icon 16x16 */}
      </a>
    </div>
    <p className="text-xs text-gray-600">Read-only</p>
  </div>
</div>
```

The GitHub and npm icons are standard SVG paths (GitHub's Octocat mark, npm's logo). Both open in new tabs.

---

## 5. Favicon

### 5.1 Approach

Use the Google Material Symbols "terminal" icon as an SVG favicon. The icon will be colored with the brand terracotta (`#d97757`) on a transparent background.

### 5.2 Implementation

1. Create `apps/web/public/favicon.svg` containing the Material Symbols "terminal" icon SVG with fill set to `#d97757`
2. Add the favicon link to the `head()` function in `__root.tsx`:

```ts
head: () => ({
  meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: 'Claude Session Dashboard' },
    { name: 'description', content: 'Local observability dashboard for Claude Code sessions' },
  ],
  links: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'stylesheet', href: appCss },
  ],
}),
```

The SVG favicon approach is supported by all modern browsers (Chrome, Firefox, Safari 15+, Edge) and works at any resolution. No need for multiple PNG sizes or a `.ico` file.

### 5.3 Additional Meta Tags

While updating `__root.tsx`, also add:
- `<meta name="theme-color" content="#141413">` for browser chrome coloring
- `<meta name="description">` for SEO/sharing

---

## 6. Architecture

### 6.1 Change Propagation

```
app.css (@theme warm grays + brand)
    |
    +---> ALL components get warm grays automatically (zero file changes)
    |
    v
__root.tsx (favicon link, meta tags, body bg already uses gray-950)
    |
    v
AppShell.tsx (header logo color, nav icons, footer links)
    |
    v
25+ component files (blue-* -> brand-* class swaps)
    |
    v
Chart hex files (hardcoded #3b82f6 -> #d97757)
    |
    v
SKILL.md uiux (update design system documentation)
```

### 6.2 Zero-Change Gray Migration

Because Tailwind v4 supports `@theme` overrides in CSS:

```
Before: bg-gray-800 -> resolves to #1f2937 (cool gray)
After:  bg-gray-800 -> resolves to #2a2926 (warm gray, from @theme override)
```

This means the ~100+ files using `gray-*` classes need ZERO changes. Only the `app.css` file is modified.

---

## 7. Affected Files -- Complete Inventory

### 7.1 CSS / Config (1 file)

| File | Change |
|------|--------|
| `src/styles/app.css` | Add `@theme` block with warm gray overrides and brand color scale |

### 7.2 Root / Shell (2 files)

| File | Change |
|------|--------|
| `src/routes/__root.tsx` | Add favicon link, theme-color meta, description meta |
| `src/components/AppShell.tsx` | Logo: `text-blue-400` -> `text-brand-500`; replace ASCII nav icons with inline SVGs; add GitHub + npm links in footer |

### 7.3 Blue -> Brand Class Name Swaps (per-file detail)

| File | Lines Affected | Changes |
|------|---------------|---------|
| `src/routes/_dashboard/stats.tsx` | 117, 127 | `border-blue-500` -> `border-brand-500` |
| `src/routes/_dashboard/sessions/$sessionId.tsx` | 57 | `text-blue-400` -> `text-brand-400` |
| `src/features/settings/PricingTableEditor.tsx` | 106, 108 | `border-blue-500`, `bg-blue-500/10`, `text-blue-400` -> brand equivalents |
| `src/features/settings/SettingsPage.tsx` | 93, 186 | `bg-blue-600` -> `bg-brand-600`; `hover:bg-blue-500` -> `hover:bg-brand-500` |
| `src/features/settings/TierSelector.tsx` | 20 | `border-blue-500 bg-blue-500/10` -> brand equivalents |
| `src/features/privacy/PrivacyToggle.tsx` | 13 | `bg-blue-600` -> `bg-brand-600` |
| `src/features/session-detail/ToolUsagePanel.tsx` | 35, 38 | `bg-blue-500/20` -> `bg-brand-500/20`; `text-blue-300` -> `text-brand-300` |
| `src/features/session-detail/TasksPanel.tsx` | 11, 12 | `bg-blue-500/20` -> `bg-brand-500/20`; `text-blue-400` -> `text-brand-400` |
| `src/features/session-detail/ContextWindowPanel.tsx` | 81, 116, 138, 271, 312 | All `bg-blue-500`/`bg-blue-400`/`text-blue-400` -> brand equivalents |
| `src/features/session-detail/TokenSummary.tsx` | 12 | `text-blue-400` -> `text-brand-400` |
| `src/features/session-detail/SessionTimeline.tsx` | 163 | `bg-blue-500/15 text-blue-400` -> `bg-brand-500/15 text-brand-400` |
| `src/features/session-detail/timeline-chart/TimelineEventsChart.tsx` | 202 | Same blue badge pattern -> brand |
| `src/features/cost-estimation/CostEstimationPanel.tsx` | 72, 96 | `text-blue-400` -> `text-brand-400`; `bg-blue-400` -> `bg-brand-400` |
| `src/features/project-analytics/ProjectTable.tsx` | 96 | `text-blue-400` -> `text-brand-400` |
| `src/features/sessions/PaginationControls.tsx` | 34, 77 | `focus:border-blue-500` -> `focus:border-brand-500`; `bg-blue-600` -> `bg-brand-600` |
| `src/features/sessions/SessionFilters.tsx` | 70, 96 | `focus:border-blue-500 focus:ring-blue-500` -> brand equivalents |

### 7.4 Hardcoded Hex Swaps (chart/visualization files)

| File | Changes |
|------|---------|
| `src/features/stats/ModelUsageChart.tsx` | COLORS[0]: `#3b82f6` -> `#d97757`; COLORS[5]: `#6366f1` -> `#b07cc5`; tooltip bg/border hex |
| `src/features/stats/TokenTrendChart.tsx` | Same COLORS swap; tooltip bg/border hex |
| `src/features/stats/ActivityChart.tsx` | Messages fill `#3b82f6` -> `#d97757`; grid stroke, tick fill, tooltip hex |
| `src/features/stats/ContributionHeatmap.tsx` | INTENSITY_COLORS full replacement (5 values) |
| `src/features/stats/HourlyDistribution.tsx` | `rgba(59, 130, 246, ...)` -> `rgba(217, 119, 87, ...)` |
| `src/features/session-detail/ContextWindowPanel.tsx` | `#3b82f6` in gradient stops and stroke -> `#d97757`; tooltip hex |
| `src/features/session-detail/timeline-chart/timeline-colors.ts` | `Read/Grep/Glob` color `#60a5fa` -> `#e09070`; colorMap entry swap |

### 7.5 New Files (2 files)

| File | Purpose |
|------|---------|
| `apps/web/public/favicon.svg` | SVG favicon with Material Symbols "terminal" icon in terracotta |
| (none else) | All other changes are modifications |

### 7.6 Documentation Update (1 file)

| File | Change |
|------|--------|
| `.claude/skills/uiux/SKILL.md` | Update design system doc with new color palette, brand scale, warm grays |

---

## 8. Detailed Component Changes

### 8.1 `app.css` -- Full New Content

```css
@import 'tailwindcss';

@theme {
  /* Warm gray scale (overrides Tailwind default cool grays) */
  --color-gray-50: #f5f3ec;
  --color-gray-100: #eae6dc;
  --color-gray-200: #e0dbd0;
  --color-gray-300: #cdc8b8;
  --color-gray-400: #a39e90;
  --color-gray-500: #7a7668;
  --color-gray-600: #565349;
  --color-gray-700: #3d3b36;
  --color-gray-800: #2a2926;
  --color-gray-900: #1c1c1a;
  --color-gray-950: #141413;

  /* Brand terracotta accent */
  --color-brand-300: #f0b8a0;
  --color-brand-400: #e09070;
  --color-brand-500: #d97757;
  --color-brand-600: #c4643f;
  --color-brand-700: #a8512e;
}
```

### 8.2 `AppShell.tsx` -- Sidebar Redesign

Key structural changes:
- Logo: `text-blue-400` -> `text-brand-500` on "Claude"
- Nav icons: replace `>`, `#`, `*` strings with inline SVG components (16x16)
- Footer: two external link icons (GitHub, npm) on the left; "Read-only" label on the right
- Active nav state: `bg-gray-800` stays (auto-warm via @theme); link text stays white

### 8.3 `__root.tsx` -- Meta Tags

Add to the `links` array:
```ts
{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
```

Add to the `meta` array:
```ts
{ name: 'theme-color', content: '#141413' },
{ name: 'description', content: 'Local observability dashboard for Claude Code sessions' }
```

---

## 9. Favicon SVG Specification

Source: Google Material Symbols "terminal" icon (rounded, weight 400, grade 0, optical size 24).

The SVG path data for the "terminal" icon:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="32" height="32" fill="#d97757">
  <path d="m146-346-42-42 147-147-147-147 42-42 189 189-189 189Zm254 26v-60h414v60H400Z"/>
</svg>
```

This produces a `>_` terminal prompt icon in terracotta on a transparent background. The 32x32 size ensures crisp rendering in browser tabs.

---

## 10. Risks and Trade-offs

### 10.1 Color Accessibility

| Risk | Severity | Mitigation |
|------|----------|------------|
| Terracotta on dark background may have lower contrast than blue | Medium | `#e09070` (brand-400) on `#141413` (gray-950) has contrast ratio ~5.8:1, which passes WCAG AA for normal text. Verify all text-on-bg combinations. |
| Warm grays may reduce contrast for muted text | Low | `#7a7668` (gray-500) on `#141413` has ~4.1:1 contrast, passing AA for large text. For body text at text-xs, this is acceptable per existing pattern. |

### 10.2 Chart Readability

| Risk | Severity | Mitigation |
|------|----------|------------|
| Terracotta as first chart color may be confused with amber/yellow | Medium | Terracotta (`#d97757`) and amber (`#f59e0b`) are visually distinct (orange-red vs yellow-orange). Test with colorblind simulation. |
| Heatmap terracotta intensity may be less intuitive than blue | Low | Users already learned the heatmap; terracotta warm-to-bright scale is natural. |

### 10.3 Scope Creep

| Risk | Severity | Mitigation |
|------|----------|------------|
| Timeline tool colors use blue for "Read" -- changing this breaks the semantic grouping convention | Low | The tool color for Read/Grep/Glob shifts from `#60a5fa` (blue) to `#e09070` (brand-400). This is a stylistic shift, not a semantic one. Read tools are still consistently colored. |
| Green semantic colors for "active" are unrelated to brand | None | Keeping green for active state is correct UX. Do not change. |

### 10.4 Browser Compatibility

| Risk | Severity | Mitigation |
|------|----------|------------|
| SVG favicon not supported in older browsers | Very Low | All modern browsers support SVG favicons. This is a localhost dev tool; users have modern browsers. |
| `@theme` directive requires Tailwind v4 | None | Project already uses Tailwind v4 (`^4.1.0` in package.json). |

### 10.5 Maintenance

| Risk | Severity | Mitigation |
|------|----------|------------|
| Future components might accidentally use `blue-*` instead of `brand-*` | Medium | Update the `uiux` SKILL.md design system doc to specify `brand-*` as the accent. Add a note to CLAUDE.md conventions. Consider an ESLint rule or PR review checklist item. |
| Hardcoded hex values in charts are scattered | Low | Could centralize chart colors into a shared `chart-colors.ts` constant. Out of scope for this PR but recommended follow-up. |

---

## 11. Implementation Order

1. **`app.css`** -- Add `@theme` block (warm grays + brand scale). This immediately warms up the entire UI with zero component changes.
2. **`public/favicon.svg`** -- Create the favicon file.
3. **`__root.tsx`** -- Add favicon link and meta tags.
4. **`AppShell.tsx`** -- Redesign header, nav icons, footer links, swap `text-blue-400` to `text-brand-500`.
5. **Blue -> brand class swaps** -- Batch replace across the 16 component files listed in section 7.3.
6. **Hardcoded hex swaps** -- Update the 7 chart/visualization files listed in section 7.4.
7. **`uiux/SKILL.md`** -- Update design system documentation.

Steps 1-3 can be done first and verified visually. Steps 4-6 are the bulk of the work. Step 7 is documentation cleanup.

---

## 12. Summary of File Changes

**Total files modified: 27**
**New files: 1** (`public/favicon.svg`)

| Category | Count | Files |
|----------|-------|-------|
| CSS/Config | 1 | `app.css` |
| Root/Shell | 2 | `__root.tsx`, `AppShell.tsx` |
| Blue->Brand swaps | 16 | See section 7.3 |
| Hex chart swaps | 7 | See section 7.4 |
| Documentation | 1 | `uiux/SKILL.md` |
| New assets | 1 | `public/favicon.svg` |
