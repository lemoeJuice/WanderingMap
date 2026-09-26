# Wander Map

A local-first personal atlas for places, routes, journeys, and the times that connect them.

## Requirements

- Node.js 20.19+ (Node 22+ recommended)
- pnpm 10+

## Run locally

```sh
pnpm install
pnpm dev
```

The app is served by Vite. Places, connections, journeys, visits, and settings are persisted in IndexedDB; no account or backend is required. OpenFreeMap is the default basemap. When the basemap is unavailable, the local place list and editing workflows remain available.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Playwright requires a Chromium browser (`pnpm exec playwright install chromium`). Unit and repository tests use Vitest, jsdom, and fake-indexeddb.

## GitHub Pages

Pushing to `main` runs `.github/workflows/pages.yml`, which type-checks, lints, runs unit and browser E2E tests, builds with the repository-name base path, and deploys `dist` to GitHub Pages. The workflow also includes a `404.html` fallback so Vue Router routes and read-only share links work on GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Core boundaries

- `src/domain/` contains framework- and provider-independent types, schemas, services, and derived statistics.
- `src/repositories/` is the only persistence boundary. Dexie/IndexedDB is not accessed by views.
- Coordinates in domain records are WGS84. Provider-specific conversions live under `src/providers/coordinate/`.
- Visit counts, last visit, dwell time, and heatmap weights derive from `VisitRecord`; they are not copied onto `Place`.
- Planned journeys do not create visits. Recorded journey stops atomically save a `VisitRecord` and a journey reference.
- Share links use strict shared DTOs; private notes, photo references/files, visit records, and exact journey timestamps are not projected.

See `design-doc/DESIGN.md` and `design-doc/IMPLEMENTATION.md` for product and implementation context.
