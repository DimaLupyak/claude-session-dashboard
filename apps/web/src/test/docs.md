# Noridoc: test

Path: @/apps/web/src/test

### Overview

- Vitest test infrastructure: global setup and type declarations for the test environment
- Provides browser API mocks (localStorage, clipboard) and custom matchers needed by component tests across the app

### How it fits into the larger codebase

- `setup.ts` is referenced as the Vitest `setupFiles` entry, running before every test file in the project
- `vitest.d.ts` augments the Vitest `Assertion` and `AsymmetricMatchersContaining` interfaces so TypeScript recognizes custom matchers like `toBeInTheDocument()`
- Component tests throughout `@/apps/web/src/features/` depend on the mocks and matchers configured here

### Core Implementation

- **Custom `toBeInTheDocument` matcher:** Checks `document.body.contains(received)`, providing a lightweight alternative to `@testing-library/jest-dom` for DOM presence assertions
- **localStorage mock:** A `LocalStorageMock` class implementing the full `Storage` interface, assigned to `window.localStorage` via `Object.defineProperty`
- **Clipboard mock:** Makes `navigator.clipboard` writable and configurable so individual tests can replace `writeText` with a `vi.fn()` via `Object.assign`. The default stub is a no-op async function
- **Cleanup:** `beforeEach` clears localStorage and calls `@testing-library/react`'s `cleanup()` to unmount rendered components between tests

### Things to Know

- `navigator.clipboard` is defined with `writable: true` and `configurable: true` specifically so tests like `SessionIdDisplay.test.tsx` can override it with `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })` per test suite
- The custom `toBeInTheDocument` matcher is a manual implementation, not from `@testing-library/jest-dom` -- the corresponding type declaration in `vitest.d.ts` makes it available to TypeScript without installing that package

Created and maintained by Nori.
