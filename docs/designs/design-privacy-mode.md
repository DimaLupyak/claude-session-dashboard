# Design: Privacy Mode

## Problem
Users want to share screenshots without exposing real filesystem paths, usernames, or project names.

## Approach: Client-side React Context with localStorage

- No server changes — anonymization at render time only
- React Query caches, server functions, URL params remain untouched
- Toggle is instant (no refetch needed)

## New Slice: `features/privacy/`

| File | Purpose |
|------|---------|
| `PrivacyContext.tsx` | Provider + `usePrivacy()` hook, localStorage persistence |
| `anonymize.ts` | Pure functions: `anonymizePath()`, `anonymizeProjectName()`, `buildProjectNameMap()` |
| `PrivacyToggle.tsx` | Sidebar toggle button |

## Anonymization Rules

| Data | Raw | Anonymized |
|------|-----|-----------|
| Paths | `/Users/username/Documents/GitHub/my-project` | `/Users/user/Documents/GitHub/my-project` |
| Project names | `my-project` | `project-1` (stable alphabetical index) |
| Branch names | unchanged | unchanged (not sensitive) |
| Session IDs, timestamps, tokens | unchanged | unchanged |

## Modified Files

| File | Change |
|------|--------|
| `__root.tsx` | Wrap with `PrivacyProvider` |
| `AppShell.tsx` | Add `PrivacyToggle` to sidebar footer |
| `SessionCard.tsx` | Anonymize `projectName` and `cwd` display |
| `SessionFilters.tsx` | Anonymize dropdown labels (keep real values for filtering) |
| `$sessionId.tsx` | Anonymize `detail.projectName` heading |

## SSR Hydration

Provider initializes `false`, reads localStorage in `useEffect` to avoid mismatch.

## Known Limitation

URL bar still shows real `projectPath` on detail page — users should crop URL bar from screenshots.
