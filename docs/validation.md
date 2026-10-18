# Validation

Test host: Ubuntu 25.10, Linux x64, Node.js 22.22.1. Desktop runtime: Electron 44.9.0. Original artifact investigation completed on 2026-10-17; aggregation and Explain update verified on 2026-10-18. Current application version: 0.3.0.

## Automated checks

| Check                       | Coverage                                                                                                                                                                                                                                                                                                                     | Result                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript                  | Renderer, main/preload, shared contracts, tests                                                                                                                                                                                                                                                                              | Pass, strict mode and unused declarations checked    |
| Unit tests                  | BSON precision/types, JSON boundaries, recursive write-stage blocking, query limits, CSV, error redaction, schema sampling, atomic concurrent storage, classic/SBE/aggregation/shard Explain adapters, absent vs zero metrics                                                                                                | 13 passed                                            |
| Real MongoDB integration    | Isolated MongoDB 8.0.16; find/filter/projection/paging, conflict-safe CRUD, BSON fidelity, aggregation with disabled stages, planner vs measured Explain, query/Explain cancellation, schema, indexes, all read-only write boundaries, import, collections, persistence                                                      | 9 passed                                             |
| Browser UI                  | Collection tabs, paging, inspector/views, filters, invalid JSON, saved queries, CRUD dialogs, stage editing and prefix previews, disabled-stage saves, JSON round trips/invalid drafts, visual Explain, schema/indexes, theme, keyboard palette, compact viewport, new database/collection, import/export, drop confirmation | 12 passed                                            |
| Desktop UI                  | Actual Electron window/preload/IPC, native driver connection, Int64 display, saved edit checked independently through MongoDB, indexes, live stage preview and disabled-stage execution, planner diagram and real execution statistics                                                                                       | Pass                                                 |
| Packaged Linux executable   | Same desktop scenario against the app inside `release/linux-unpacked`                                                                                                                                                                                                                                                        | Pass                                                 |
| Production build            | Vite renderer and esbuild main/preload                                                                                                                                                                                                                                                                                       | Pass                                                 |
| Production dependency audit | `npm audit --omit=dev`                                                                                                                                                                                                                                                                                                       | 0 known vulnerabilities at 0.2 lockfile verification |

The final AppImage also passed the same desktop/MongoDB scenario with `APPIMAGE_EXTRACT_AND_RUN=1` and sandboxing enabled. The portable archive was fully read to verify its gzip/tar integrity. SHA-256 checksums are provided in `release/SHA256SUMS`.

The desktop test explicitly sets Playwright's `chromiumSandbox: true`, which prevents Playwright from silently appending `--no-sandbox` on Linux. It checks that the app's command line has no such flag, verifies the sandbox/context isolation/Node integration preferences, and verifies that renderer JavaScript cannot access `require` or `process`. Earlier runs checked window preferences before this stronger launch check was added; the explicit sandbox launch was then independently rerun successfully.

At the 0.2 dependency verification, the full development tool tree retained eight moderate advisories through the packaging tool's proxy/logging dependencies. These dependencies are not included as app runtime dependencies. No critical/high advisory was found in that snapshot. The 0.3 update changes no dependency versions. The dependency lockfile is retained; this report is a snapshot, not a claim that future advisories will never apply.

The 0.2 checks additionally verify cancellation against a MongoDB failpoint, session-only connection recovery, virtualized keyboard navigation, server-backed sorting, lazy tree expansion, native clipboard writes, and the absence of editor/demo chunks during desktop startup. The reproducible performance scenario is in [performance.md](performance.md) (one additional passing test).

The 0.3 checks add planner/execution scope, BSON numeric Explain fields, SBE node matching, shard branches, grouped-output false-positive prevention, stage input/output previews, invalid draft recovery, disabled-stage persistence, and static visual diagnostics. The desktop welcome check also excludes aggregation/Explain/example chunks. There are 36 distinct automated scenarios across unit, integration, browser, desktop, and performance suites.

## Reproduce

```bash
npm ci
npm run check
npm test
npm run test:integration
npm run test:e2e
npm run test:performance
npm run build
xvfb-run -a npm run test:desktop
npm run dist:linux
CANOPY_EXECUTABLE=./release/linux-unpacked/canopy-mongo xvfb-run -a npm run test:desktop
APPIMAGE_EXTRACT_AND_RUN=1 CANOPY_EXECUTABLE=./release/Canopy-0.3.0.AppImage xvfb-run -a npm run test:desktop
```

`xvfb-run` is for a headless test display. On a desktop, `npm run test:desktop` can use the existing display. Tests use temporary app-data directories and isolated databases, never the user's saved connections. MongoDB's test binary is cached in `.local/mongodb-binaries`.

Browser tests use `CANOPY_BROWSER` if provided, otherwise the installed Brave path when available, otherwise Playwright's bundled Chromium (`npx playwright install chromium`).

## Visual review

- `screenshots/workspace-light.png`: sample data workspace in light mode.
- `screenshots/workspace-dark.png`: dark mode after correcting the editor's background.
- `screenshots/workspace-compact.png`: 1024×768 desktop viewport, with scrolling contained in the table.
- `screenshots/desktop-live.png`: real desktop app showing an edit round trip to the temporary MongoDB server.

- `screenshots/aggregation-steps.png`: step editor and scoped preview results.
- `screenshots/explain-light.png`, `explain-dark.png`, `explain-compact.png`: static plan with contextual evidence.
- `screenshots/explain-checks.png`: evidence and next checks.
- `screenshots/explain-live.png`: execution statistics in Electron against the isolated MongoDB.

## Boundaries

Tests verify the listed workflows, not parity with other MongoDB clients. No live production/user database was contacted. Atlas/SRV, authentication providers, TLS certificates, replica-set failover, SSH tunnels against a real OpenSSH server (the integration test uses a stand-in `ssh`), OS keyring persistence, macOS/Windows packaging, other Linux distributions, real screen readers, and exhaustive accessibility/contrast behavior have not been independently exercised. Read-only mode is an application guard; server roles remain the permission boundary.

AppImage/tar artifacts are generated locally and unsigned. Cross-platform configuration is provided; Linux x64 is the runtime target actually tested here.
