<div align="center">

<img src="resources/icon.png" width="88" alt="Canopy icon" />

# Canopy

**A fast, open-source MongoDB GUI for Linux. No Java, no account, no telemetry.**

Browse collections, write native queries, build aggregations stage by stage, read query plans, and edit documents without losing BSON types.

[![License: MIT](https://img.shields.io/badge/license-MIT-2f9e77.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Linux%20x64-4b6bfb.svg)
![Status](https://img.shields.io/badge/status-beta-d2a363.svg)

[Download](https://github.com/marco-bertelli/canopy/releases) · [Features](#features) · [Build from source](#build-from-source) · [Roadmap](#roadmap) · [Contributing](#contributing)

![Canopy demo: query, inspect, aggregate, explain](docs/demo.gif)

</div>

## Why Canopy

Most MongoDB desktop clients on Linux are heavy JVM apps, need an account, or send usage data home. Canopy is a small Electron app built for the everyday developer workflow: connect, find a collection, query it, inspect a document, make one deliberate edit, and get back to coding.

- **Safe around production.** Read-only mode is enforced in the backend, not just hidden in the UI. Production connections start read-only. Edits fail closed if the document changed since you loaded it.
- **Lossless BSON.** ObjectId, Int64, Decimal128, dates, and binary data round-trip through Canonical Extended JSON.
- **Private by default.** No account, activation, subscription, telemetry, AI, or cloud service. Saved connection strings are encrypted with your OS keyring.
- **SSH tunnels built in.** Canopy uses your system `ssh`, so `~/.ssh/config`, keys, the agent, and `ProxyJump` already work.

## Features

| Area              | What you get                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connections**   | `mongodb://` and `mongodb+srv://` URIs (Atlas, TLS, replica sets, authSource), SSH tunnels, environment labels and colors, backend-enforced read-only mode     |
| **Explorer**      | Databases and collections, filtering, multiple collection tabs, create/drop with confirmation                                                                  |
| **Queries**       | Native filter, projection, and sort with JSON validation, field/operator completion, formatting, keyboard execution, and 25–500 documents per page             |
| **Documents**     | Table, collapsible tree, and lossless JSON views; inspector; insert, edit, delete, and copy, with optimistic concurrency checks                                |
| **Aggregation**   | Ordered stages, operator search, reorder/duplicate/disable stages, input/output preview for any stage. `$out` and `$merge` are rejected                        |
| **Explain**       | Winning-plan diagram, per-stage evidence, documents and keys examined, actionable checks. **Run & measure** executes the query on request and can be cancelled |
| **Indexes**       | Create and drop indexes; schema summary of field types and presence from a sample                                                                              |
| **Import/export** | Insert JSON/EJSON objects or arrays; export the current page as Extended JSON or CSV                                                                           |
| **Workflow**      | Saved queries, history of the last 100 runs, command palette, light/dark themes, keyboard navigation, built-in sample data                                     |

<table>
  <tr>
    <td><img src="docs/screenshots/aggregation-comparison-light.png" alt="Stage-by-stage aggregation with input and output preview" /></td>
    <td><img src="docs/screenshots/explain-dark.png" alt="Visual Explain plan in dark mode" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Stage-by-stage aggregation with input/output previews</sub></td>
    <td align="center"><sub>Visual Explain with actionable checks</sub></td>
  </tr>
</table>

### Keyboard

| Action                          | Shortcut       |
| ------------------------------- | -------------- |
| Execute query                   | Ctrl / ⌘ Enter |
| Save query                      | Ctrl / ⌘ S     |
| Search commands and collections | Ctrl / ⌘ K     |
| Close a dialog                  | Esc            |

## Install

Download the latest **AppImage** or **tar.gz** from [Releases](https://github.com/marco-bertelli/canopy/releases).

```bash
chmod +x Canopy-*.AppImage
./Canopy-*.AppImage
```

If FUSE isn't available, use the tar.gz instead: extract it and run `canopy-mongo`. Builds target x64 glibc desktops. See the [Linux notes](docs/linux.md) for keyrings, sandboxing, and networking.

## Connecting through SSH

Fill in **SSH tunnel** in the connection dialog with `user@bastion`, `ssh://user@bastion:2222`, or any alias from `~/.ssh/config`. The MongoDB URI host is resolved from the SSH server:

```
Connection string   mongodb://appuser:secret@10.0.3.12:27017/app
SSH tunnel          prod-bastion
```

Canopy runs `ssh -N -L` on a free local port, connects with `directConnection=true`, and stops the tunnel when you disconnect. It never asks for passwords, so use key or agent authentication. Unknown host keys are rejected: run `ssh prod-bastion` once to trust the host first. `mongodb+srv://` URIs can't be tunnelled; use one replica-set member instead.

## Writing queries

Queries are JSON (Extended JSON), not JavaScript shell expressions:

```json
{ "status": "active", "orders": { "$gte": 5 } }
```

```json
{ "_id": { "$oid": "507f1f77bcf86cd799439011" } }
```

```json
[
  { "$match": { "status": "active" } },
  { "$group": { "_id": "$country", "customers": { "$sum": 1 } } },
  { "$sort": { "customers": -1 } }
]
```

## Build from source

Requires Node.js 22.19+ and npm. You don't need a local MongoDB to open the app; it ships with a sample workspace.

```bash
git clone https://github.com/marco-bertelli/canopy.git
cd canopy
npm ci
npm run dev          # desktop app with hot reload
npm run dist:linux   # AppImage + tar.gz in release/
```

`npm run dev:web` serves a browser preview at `http://127.0.0.1:5173`, backed by an in-memory query engine with sample data. Live connections are only available in the desktop app.

## Security and privacy

- The renderer is sandboxed, with Node disabled and context isolation on. It reaches the official MongoDB driver only through one typed, validated IPC bridge. No local HTTP API is opened.
- Saved connection strings are encrypted with Electron `safeStorage` and your OS keyring. On Linux the plaintext `basic_text` fallback is refused. Saved connections never auto-connect.
- Workspace state (saved queries and history) lives in `workspace.json` in the app data directory, with mode `0600`. Queries may contain sensitive values, so history can be cleared.
- Read-only mode is an application guard. Database roles remain the real permission boundary.

Details are in [docs/architecture.md](docs/architecture.md).

## Current limits

- No JavaScript shell, SQL translation, or scheduled jobs.
- Aggregation is read-only. Schema analysis samples up to 200 documents.
- Import accepts up to 1,000 JSON/EJSON documents (10 MB). Export covers the current page, not a whole collection.
- A query returns at most 500 documents and 16 MB, with a 15-second server time limit.
- Builds are unsigned. macOS and Windows builds are configured but not yet tested.

## Roadmap

- [x] SSH tunnels
- [ ] mongosh-style JavaScript shell
- [ ] Whole-collection import/export (CSV, NDJSON)
- [ ] Flathub and AUR packages
- [ ] Tested macOS and Windows builds

Ideas and votes are welcome in [Issues](https://github.com/marco-bertelli/canopy/issues).

## Contributing

Bug reports, UX feedback, and pull requests are welcome. Before opening a PR:

```bash
npm run check             # type check
npm test                  # unit tests
npm run test:integration  # real MongoDB 8 in a temporary directory
npm run test:e2e          # Playwright UI tests
npm run format
```

Integration tests download an isolated MongoDB binary into `.local/` and never touch your saved connections. More on testing is in [docs/validation.md](docs/validation.md); design notes are in [docs/ux.md](docs/ux.md) and [docs/aggregation-explain-ux.md](docs/aggregation-explain-ux.md).

## License

[MIT](LICENSE). MongoDB is a trademark of MongoDB, Inc. Canopy is an independent project and is not affiliated with or endorsed by MongoDB, Inc.
