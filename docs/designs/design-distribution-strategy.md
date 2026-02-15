# Design: Distribution & Installation Strategy

## 1. Problem Statement

The Claude Session Dashboard is currently only usable by cloning the Git repository, running `npm install`, and starting the dev server. There is no way for Claude Code users to quickly try the dashboard without a full development setup. The goal is to make the dashboard installable and runnable with as few steps as possible -- ideally a single command.

### Constraints

- The app MUST have read access to `~/.claude` on the host filesystem
- The app MUST work on Linux, macOS, and Windows
- The app is built with TanStack Start (SSR on Vite v7) and produces a Node.js server in `.output/server/index.mjs`
- The app uses `node:fs`, `node:path`, and `node:os` to scan `~/.claude` at runtime (server-side only)
- The app writes only to `~/.claude-dashboard/settings.json` (never to `~/.claude/`)
- The app has platform-specific native dependencies: `lightningcss-*` (Tailwind CSS), `@tailwindcss/oxide-*`, `@rollup/rollup-*`

### Target Audience

Claude Code users -- developers who already have Node.js (v18+) and npm installed. Claude Code itself requires Node.js, so this is a safe assumption for the primary audience.

## 2. Key Decisions

### 2.1 Primary Distribution: npm Package with `npx` Support

**Decision:** Publish a public npm package that can be run with `npx claude-session-dashboard` (or a shorter alias like `npx claude-dashboard`).

**Rationale:** The target audience (Claude Code users) already has Node.js and npm. A single `npx` command is the lowest-friction installation path. No need for Docker, Homebrew, or standalone binaries for v1.

### 2.2 Ship Prebuilt Assets in the npm Package

**Decision:** The npm package ships with pre-built production assets (the `.output/` directory). The `bin` script starts the Node.js server directly -- no build step required at install time.

**Rationale:** Shipping prebuilt assets avoids requiring users to run `vite build` after install, which would pull in the full Vite toolchain, TanStack Start plugins, Tailwind CSS compiler, and all devDependencies. A prebuilt package keeps install size smaller and startup instant.

### 2.3 Package Name: `claude-session-dashboard`

**Decision:** Use `claude-session-dashboard` as the npm package name. Provide a `bin` alias of `claude-dashboard` for shorter CLI usage.

**Rationale:** The full name matches the GitHub repository. The shorter `claude-dashboard` alias is convenient for repeated use. Both `npx claude-session-dashboard` and `npx claude-dashboard` will work.

### 2.4 Monorepo Restructure: Not Required

**Decision:** Publish from `apps/web/` as the package root. Do not restructure the monorepo.

**Rationale:** The project has a single app (`apps/web/`). Publishing from this directory avoids a large refactor. The `files` field in package.json controls what ships to npm.

### 2.5 Platform-Specific Native Dependencies

**Decision:** Use `optionalDependencies` for platform-specific packages (lightningcss, Tailwind oxide, Rollup). Since we ship prebuilt assets, these are only needed at build time and can be excluded from the published package.

**Rationale:** The production server (`.output/server/index.mjs`) does not require lightningcss, Tailwind oxide, or Rollup at runtime. CSS is already compiled. Only the Node.js runtime and React server dependencies are needed.

### 2.6 Secondary Distribution: Docker

**Decision:** Provide a Dockerfile for users who prefer containerized deployment or do not have Node.js.

**Rationale:** Docker provides a hermetic environment and solves the "no Node.js" edge case. The container mounts `~/.claude` as a read-only volume.

### 2.7 Tertiary Distribution: GitHub Releases

**Decision:** Attach prebuilt tarballs to GitHub Releases for users who prefer manual download.

**Rationale:** Low effort to automate via CI. Provides an alternative for users in restricted environments where npm and Docker are not available.

## 3. Distribution Methods (Ranked)

### Priority 1: npm / npx (Primary)

```
npx claude-session-dashboard
```

or after global install:

```
npm install -g claude-session-dashboard
claude-dashboard
```

**Pros:**
- Single command, zero setup for Node.js users
- Auto-fetches latest version with `npx`
- Familiar to the target audience
- npm handles dependency resolution
- Supports semantic versioning and `npm update`

**Cons:**
- Requires Node.js v18+ and npm
- `npx` downloads the package every time unless globally installed
- Platform-specific native deps require careful `optionalDependencies` handling

**Complexity:** Medium (build pipeline, package.json restructuring, CI publish workflow)

### Priority 2: Git Clone + npm start (Current)

```
git clone https://github.com/<owner>/claude-session-dashboard.git
cd claude-session-dashboard/apps/web
npm install
npm run build
npm start
```

**Pros:**
- Already works today
- Full source access for contributors
- No registry dependency

**Cons:**
- 5 steps to get running
- Requires build step (slow, pulls all devDependencies)
- Not suitable for casual users

**Complexity:** None (already implemented)

### Priority 3: Docker

```
docker run -v ~/.claude:/root/.claude:ro -p 3000:3000 ghcr.io/<owner>/claude-session-dashboard
```

**Pros:**
- No Node.js required on host
- Hermetic environment
- Consistent across platforms
- Read-only volume mount enforces security

**Cons:**
- Requires Docker Desktop or similar
- Larger download (~200MB image)
- `~/.claude` path mapping differs on Windows (`C:\Users\<name>\.claude`)
- Overhead of running a container for a local tool

**Complexity:** Low (Dockerfile + CI build/push workflow)

### Priority 4: GitHub Releases (Tarballs)

```
# Download from GitHub Releases page
curl -L https://github.com/<owner>/claude-session-dashboard/releases/download/v0.1.0/claude-session-dashboard-v0.1.0.tar.gz | tar xz
cd claude-session-dashboard
node server/index.mjs
```

**Pros:**
- No npm or Docker required (only Node.js)
- Prebuilt, no build step
- Good for air-gapped environments

**Cons:**
- Manual download and extraction
- No auto-update
- Must manage PATH manually
- Platform awareness for native deps

**Complexity:** Low (CI workflow to build and attach tarball)

### Priority 5: Homebrew Tap (Future)

```
brew install <owner>/tap/claude-dashboard
claude-dashboard
```

**Pros:**
- Native macOS/Linux experience
- Auto-update via `brew upgrade`
- Handles PATH automatically

**Cons:**
- macOS/Linux only (no Windows)
- Requires maintaining a Homebrew tap repository
- Formula must be updated for each release
- Still requires Node.js (formula would depend on `node`)

**Complexity:** Medium (separate tap repo, formula template, CI integration)

### Priority 6: Standalone Binary (Future / P2)

Using Node.js SEA (Single Executable Application) or `pkg`:

```
# Download binary, run directly
./claude-dashboard
```

**Pros:**
- Zero runtime dependencies
- True single-file distribution
- Works without Node.js

**Cons:**
- Node.js SEA is still experimental
- Binary size ~80-120MB (embeds Node.js runtime)
- Platform-specific builds (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64)
- TanStack Start SSR compatibility with SEA is unverified
- Complex CI matrix for cross-compilation

**Complexity:** High (unproven with TanStack Start, experimental Node.js API)

## 4. Architecture: npm Package

### 4.1 Build Pipeline

```
Source Code (apps/web/src/)
         |
         v
  vite build (TanStack Start)
         |
         v
  .output/
    server/
      index.mjs          <-- Node.js server entry
      chunks/             <-- Server code chunks
    public/
      assets/             <-- Client JS/CSS bundles
      index.html          <-- (if applicable)
         |
         v
  npm pack (from apps/web/)
         |
         v
  claude-session-dashboard-0.1.0.tgz
    bin/
      cli.mjs             <-- #!/usr/bin/env node entry
    .output/
      server/             <-- Prebuilt server
      public/             <-- Prebuilt client assets
    package.json          <-- Production deps only
```

### 4.2 CLI Entry Point (`bin/cli.mjs`)

```
#!/usr/bin/env node

Purpose:
  1. Parse CLI arguments (--port, --host, --open)
  2. Set NODE_ENV=production
  3. Resolve path to .output/server/index.mjs
  4. Import and start the server
  5. Print "Dashboard running at http://localhost:3000"
  6. Optionally open browser

Arguments:
  --port, -p     Port number (default: 3000)
  --host, -h     Host to bind (default: localhost)
  --open, -o     Open browser after start (default: false)
  --help         Show usage
  --version      Show version
```

### 4.3 Package.json Changes

The `apps/web/package.json` needs these additions for npm publishing:

```
Changes to package.json:
  name:          "claude-session-dashboard"  (was same, but remove "private": true)
  bin:           { "claude-dashboard": "bin/cli.mjs",
                   "claude-session-dashboard": "bin/cli.mjs" }
  files:         ["bin/", ".output/", "LICENSE"]
  engines:       { "node": ">=18.0.0" }
  keywords:      ["claude", "claude-code", "dashboard", "session", "observability"]
  repository:    { "type": "git", "url": "..." }
  license:       "MIT"
  description:   "Local observability dashboard for Claude Code sessions"
  homepage:      "https://github.com/<owner>/claude-session-dashboard"

Remove "private": true

Move runtime dependencies to dependencies:
  @tanstack/react-query, @tanstack/react-router, @tanstack/react-start,
  date-fns, react, react-dom, recharts, zod

Move build-only deps to devDependencies (already there):
  @tailwindcss/vite, tailwindcss, @vitejs/plugin-react, vite,
  typescript, vitest, etc.

Add scripts:
  "prepublishOnly": "npm run build"
```

### 4.4 Files Shipped to npm

```
claude-session-dashboard/
  bin/
    cli.mjs                    <-- CLI entry point (~50 lines)
  .output/
    server/
      index.mjs                <-- TanStack Start production server
      chunks/                  <-- Server chunks
    public/
      assets/                  <-- Built CSS, JS bundles
  package.json                 <-- Production metadata
  LICENSE                      <-- MIT license
```

Estimated package size: ~2-5MB (server bundle + client assets, no node_modules)

### 4.5 What is NOT Shipped

```
NOT included in npm package:
  src/                         <-- Source code (not needed at runtime)
  node_modules/                <-- Resolved by npm install
  vite.config.ts               <-- Build config (not needed at runtime)
  tsconfig.json                <-- TypeScript config
  vitest.config.ts             <-- Test config
  .claude/                     <-- Agent/skill configs
  docs/                        <-- Documentation
  tests/                       <-- Test files
```

## 5. Architecture: Docker

### 5.1 Dockerfile

```
Location: apps/web/Dockerfile

Strategy:
  - Multi-stage build
  - Stage 1 (builder): Node 22 Alpine, npm ci, vite build
  - Stage 2 (runtime): Node 22 Alpine, copy .output + production deps
  - EXPOSE 3000
  - CMD ["node", ".output/server/index.mjs"]
```

### 5.2 Docker Compose Example

```
Location: docker-compose.yml (project root)

Services:
  dashboard:
    build: apps/web
    ports:
      - "3000:3000"
    volumes:
      - ~/.claude:/root/.claude:ro
    environment:
      - NODE_ENV=production
```

### 5.3 Cross-Platform Volume Mounts

```
macOS / Linux:
  -v ~/.claude:/root/.claude:ro

Windows (PowerShell):
  -v ${env:USERPROFILE}\.claude:/root/.claude:ro

Windows (cmd):
  -v %USERPROFILE%\.claude:/root/.claude:ro
```

Note: The `:ro` flag enforces read-only access at the Docker level, providing defense-in-depth beyond the application-level read-only guarantee.

### 5.4 Settings Directory in Docker

The dashboard writes to `~/.claude-dashboard/settings.json`. In Docker, this maps to `/root/.claude-dashboard/`. Users need a second volume mount if they want settings persistence:

```
-v ~/.claude-dashboard:/root/.claude-dashboard
```

This mount is NOT read-only since settings are written here.

## 6. Architecture: GitHub Releases

### 6.1 Release Artifact

```
claude-session-dashboard-v{version}.tar.gz
  claude-session-dashboard/
    bin/
      cli.mjs
    .output/
      server/
      public/
    package.json
    node_modules/              <-- Production deps bundled
    LICENSE
```

Unlike the npm package, the GitHub Release tarball includes `node_modules/` (production only) so users do not need to run `npm install`. This makes it a "download and run" experience.

### 6.2 CI Workflow

```
Trigger: GitHub Release created (tag v*)
Steps:
  1. Checkout code
  2. npm ci (in apps/web/)
  3. npm run build
  4. npm prune --production (strip devDependencies)
  5. Create tarball of: bin/, .output/, node_modules/, package.json, LICENSE
  6. Upload tarball to GitHub Release
```

## 7. CI/CD Pipeline

### 7.1 New GitHub Actions Workflows

```
.github/workflows/
  publish-npm.yml          <-- Publish to npm on release
  publish-docker.yml       <-- Build and push Docker image on release
  release-assets.yml       <-- Build and attach tarball on release
```

### 7.2 publish-npm.yml

```
Trigger: GitHub Release published (tag v*)
Jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup Node.js 22
      - cd apps/web && npm ci
      - npm run build
      - npm run typecheck
      - npm test
      - npm publish --access public
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 7.3 publish-docker.yml

```
Trigger: GitHub Release published (tag v*)
Jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Login to GHCR
      - Build multi-platform image (linux/amd64, linux/arm64)
      - Push to ghcr.io/<owner>/claude-session-dashboard:latest
      - Push to ghcr.io/<owner>/claude-session-dashboard:v{version}
```

### 7.4 release-assets.yml

```
Trigger: GitHub Release published (tag v*)
Jobs:
  tarball:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup Node.js 22
      - cd apps/web && npm ci
      - npm run build
      - npm prune --production
      - Create tarball
      - Upload to release
```

## 8. File Plan

### 8.1 New Files

| File | Purpose |
|------|---------|
| `apps/web/bin/cli.mjs` | CLI entry point with argument parsing, server startup, and browser open |
| `apps/web/Dockerfile` | Multi-stage Docker build for production image |
| `docker-compose.yml` | Docker Compose example for easy local Docker usage |
| `.github/workflows/publish-npm.yml` | CI workflow to publish npm package on release |
| `.github/workflows/publish-docker.yml` | CI workflow to build and push Docker image on release |
| `.github/workflows/release-assets.yml` | CI workflow to attach prebuilt tarball to GitHub Release |
| `.dockerignore` | Exclude node_modules, .git, etc. from Docker build context |
| `apps/web/.npmignore` | Explicit ignore list for npm publish (alternative to `files` field) |

### 8.2 Modified Files

| File | Changes |
|------|---------|
| `apps/web/package.json` | Remove `"private": true`. Add `bin`, `files`, `engines`, `keywords`, `repository`, `homepage`, `description` fields. Add `prepublishOnly` script. |
| `.gitignore` | Add `.output/` is already there. No changes needed. |

### 8.3 NOT Modified

| File | Reason |
|------|--------|
| `apps/web/vite.config.ts` | No changes needed. Build output location is TanStack Start default. |
| `apps/web/src/**` | No source code changes needed for distribution. |
| `apps/web/tsconfig.json` | No changes needed. |

## 9. CLI Entry Point Design (`bin/cli.mjs`)

```
#!/usr/bin/env node

Flow:
  1. Parse process.argv for --port, --host, --open, --help, --version
  2. If --help: print usage and exit
  3. If --version: read version from package.json and print
  4. Set process.env.NODE_ENV = 'production'
  5. Set process.env.PORT = port (default 3000)
  6. Set process.env.HOST = host (default 'localhost')
  7. Resolve serverPath = path.join(__dirname, '..', '.output', 'server', 'index.mjs')
  8. Verify serverPath exists (if not: print "Run npm run build first" and exit 1)
  9. Dynamic import(serverPath)
  10. Print banner:
        Claude Session Dashboard v{version}
        Running at http://{host}:{port}
        Reading sessions from ~/.claude
  11. If --open: spawn 'open' (macOS), 'xdg-open' (Linux), or 'start' (Windows)

Error handling:
  - If .output/ missing: clear error message suggesting build
  - If port in use: catch EADDRINUSE, suggest --port flag
  - If ~/.claude doesn't exist: warn but don't exit (dashboard shows empty state)

No external dependencies:
  - Argument parsing: manual (process.argv), no yargs/commander needed for 4 flags
  - Path resolution: node:path
  - Browser open: child_process.exec with platform detection
```

## 10. Version Management

### 10.1 Versioning Strategy

Follow semantic versioning. The version in `apps/web/package.json` is the source of truth.

```
Version bump workflow:
  1. Update version in apps/web/package.json
  2. Commit: "chore: release v{version}"
  3. Tag: git tag v{version}
  4. Push: git push && git push --tags
  5. Create GitHub Release from tag
  6. CI publishes npm, Docker, and tarball automatically
```

### 10.2 Version Checking (P2, Future)

The CLI could check for newer versions on startup:

```
On start:
  1. Fetch https://registry.npmjs.org/claude-session-dashboard/latest (with 2s timeout)
  2. Compare remote version to local version
  3. If newer: print "Update available: v{current} -> v{latest}. Run: npm i -g claude-session-dashboard"
  4. Non-blocking: never delay startup
```

This is a P2 enhancement. Not included in v1.

## 11. Cross-Platform Compatibility

### 11.1 File Path Handling

The app uses `os.homedir()` and `path.join()` from Node.js, which handle platform differences automatically:

| Platform | `~/.claude` resolves to |
|----------|------------------------|
| macOS | `/Users/<name>/.claude` |
| Linux | `/home/<name>/.claude` |
| Windows | `C:\Users\<name>\.claude` |

No changes needed -- `node:os` and `node:path` handle this correctly.

### 11.2 TanStack Start Server

The production server (`.output/server/index.mjs`) uses `srvx` (a portable HTTP server). It binds to `localhost:3000` by default and works on all platforms.

### 11.3 Docker on Windows

Docker Desktop for Windows supports volume mounts from `C:\Users\`. The compose file example includes Windows-specific mount syntax.

### 11.4 Native Dependencies at Runtime

The production build output (`.output/`) is pure JavaScript. Native dependencies (lightningcss, Tailwind oxide, Rollup) are only needed at build time. The npm package ships prebuilt assets and does not require native compilation at install time.

## 12. Security Considerations

### 12.1 Filesystem Access

- The dashboard reads `~/.claude/**` (session JSONL files, stats cache)
- The dashboard writes only to `~/.claude-dashboard/settings.json`
- No network requests to external services (no telemetry, no analytics)
- The server binds to `localhost` only by default

### 12.2 npm Package Supply Chain

- Use `npm provenance` (npm's built-in provenance attestation) in CI
- Pin exact dependency versions in lockfile
- Run `npm audit` in CI before publish
- The `prepublishOnly` script runs build + tests as a gate

### 12.3 Docker Security

- Read-only mount for `~/.claude` (`:ro` flag)
- Non-root user in container (use `USER node` in Dockerfile)
- Minimal Alpine base image
- No secrets or environment variables required

### 12.4 CLI Security

- The `bin/cli.mjs` script does not execute arbitrary code
- No `postinstall` script (avoids supply-chain attack surface)
- No network fetching during install

## 13. Testing the Distribution

### 13.1 Pre-Publish Verification

```
# Build and pack locally
cd apps/web
npm run build
npm pack

# Inspect package contents
tar tzf claude-session-dashboard-0.1.0.tgz

# Test install from tarball
cd /tmp
npm install /path/to/claude-session-dashboard-0.1.0.tgz
npx claude-dashboard --port 3001
```

### 13.2 CI Verification

The publish workflow should include a "smoke test" step:

```
# After build, before publish:
1. npm pack
2. Install tarball in a clean directory
3. Start server (background)
4. curl http://localhost:3000 (expect 200)
5. Kill server
6. Proceed to publish
```

### 13.3 Docker Verification

```
docker build -t claude-dashboard-test apps/web
docker run --rm -p 3000:3000 -v ~/.claude:/root/.claude:ro claude-dashboard-test
# curl http://localhost:3000 (expect 200)
```

## 14. README Updates

The project README should include these installation sections:

```
## Quick Start

### Using npx (recommended)
npx claude-session-dashboard

### Using npm (global install)
npm install -g claude-session-dashboard
claude-dashboard

### Using Docker
docker run -v ~/.claude:/root/.claude:ro -p 3000:3000 ghcr.io/<owner>/claude-session-dashboard

### From Source
git clone https://github.com/<owner>/claude-session-dashboard.git
cd claude-session-dashboard/apps/web
npm install
npm run build
npm start
```

## 15. Implementation Order

| Phase | Work | Effort |
|-------|------|--------|
| **Phase 1** | Create `bin/cli.mjs`, update `package.json` for npm publishing, test locally with `npm pack` | 1-2 days |
| **Phase 2** | Create `.github/workflows/publish-npm.yml`, set up npm token secret, publish first version | 0.5 day |
| **Phase 3** | Create `Dockerfile`, `.dockerignore`, `docker-compose.yml`, test locally | 0.5 day |
| **Phase 4** | Create `.github/workflows/publish-docker.yml` and `release-assets.yml` | 0.5 day |
| **Phase 5** | Update README with installation instructions | 0.5 day |
| **Total** | | **3-4 days** |

Phase 1 is the critical path. Phases 2-5 can be done incrementally after the first npm publish.

## 16. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| TanStack Start `.output/` structure changes between versions | Medium | Pin TanStack Start version. Test build output in CI before publish. The `bin/cli.mjs` script verifies `.output/server/index.mjs` exists before starting. |
| npm package name `claude-session-dashboard` already taken | Low | Check npm registry before first publish. Fall back to `@<scope>/claude-session-dashboard` if taken. |
| Large npm package size due to `.output/` | Medium | Use `files` field to include only `bin/` and `.output/`. Exclude source maps. Target <5MB. Monitor with `npm pack --dry-run`. |
| `srvx` server in `.output/` does not respect PORT env var | Medium | Test PORT override before shipping. If srvx ignores it, wrap the server entry in `bin/cli.mjs` to create a custom HTTP listener that proxies to the handler. |
| Windows users encounter path issues with `~/.claude` | Low | `os.homedir()` and `path.join()` handle Windows paths. Test on Windows CI runner. |
| Docker image grows too large | Low | Multi-stage build with Alpine. Prune devDependencies. Target <200MB image. |
| Users run `npx claude-session-dashboard` without `~/.claude` existing | Low | Dashboard gracefully shows empty state. CLI prints informational message: "No Claude sessions found at ~/.claude". |
| Breaking change in TanStack Start build output (dist/ vs .output/) | High | Pin to TanStack Start v1.x. The current setup uses `.output/` via Nitro/srvx. If future versions switch to `dist/`, update `bin/cli.mjs` path resolution accordingly. |

## 17. Future Enhancements (P2, Out of Scope)

1. **Version update notifications** -- CLI checks npm registry on startup and suggests update
2. **Homebrew tap** -- Formula that depends on Node.js, installs the npm package
3. **Standalone binary** -- Node.js SEA or `bun compile` when TanStack Start compatibility is confirmed
4. **Windows installer** -- `.msi` or WinGet package for Windows-native installation
5. **Auto-open browser** -- Detect if running interactively and open browser by default
6. **Custom `~/.claude` path** -- `--claude-dir` flag for non-standard installations
7. **Health check endpoint** -- `/api/health` for Docker orchestration (already localhost-only)
8. **npm provenance attestation** -- Use `--provenance` flag in CI for supply-chain verification
