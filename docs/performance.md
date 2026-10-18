# Performance and UX: 0.2

The workload is 500 documents with 60 string fields plus `_id`, in the local browser preview at 1480×960. Both runs used the same machine, browser, demo query engine, page size, and bridge delay. This measures interaction/rendering cost; it is not a claim that MongoDB server execution became faster.

| Measurement                                      |   Before |  After |
| ------------------------------------------------ | -------: | -----: |
| Mounted table cells                              |   31,000 |  1,489 |
| Fill the filter and show the changed-query state |   562 ms |  62 ms |
| Run query through results becoming available     | 1,280 ms | 374 ms |

These are individual diagnostic runs, not statistical latency guarantees. The DOM reduction is deterministic for the tested viewport; timing varies with hardware and load. Raw observations are retained in `performance/before.json` and `performance/after.json`.

## What changed

- The table mounts the visible rows and an overscan buffer. All 500 documents stay in the result page for scrolling, inspection, copying, and export. Column widths derive from a small data sample, so layout does not depend on rendering every row.
- The result table is a separate memoized component with stable callbacks. Editing a query no longer rebuilds the result cells.
- Arrow keys, Home, and End retain a focused row even when virtualization replaces its DOM node. Selecting text does not open the inspector unexpectedly. Header clicks cycle ascending, descending, and unsorted through native MongoDB sort.
- Closed tree nodes do not mount their descendants. Wide objects/arrays disclose 50 entries at a time. Whole-page and inspector JSON formatting are memoized.
- Editor extensions remain stable across keystrokes. Read-only result viewers skip input lint/completion work. Editor and demo dependencies load on demand; the actual desktop welcome screen is tested to load neither editor nor sample/BSON chunks.
- A shared helper previously pulled editor code into the startup dependency graph despite lazy imports. Explicit chunk boundaries now isolate common runtime helpers and keep those dependencies out of startup.
- MongoDB results reuse their canonical serialization rather than BSON-serializing each document twice. Cursor batches target the requested page plus one lookahead document. The UI no longer fetches the full saved-query/history workspace after every execution.
- Queries have request IDs and AbortControllers. Stop, closing a running tab, changing workspaces, disconnecting, and quitting release pending reads. A late result cannot overwrite a cancelled/replaced request. The driver may close an aborted socket and establish another connection for subsequent work.
- Schema and index reads are cached per tab with explicit refresh/resample controls. Data writes invalidate the schema sample.
- Reloading the renderer or returning from the demo recovers metadata for existing session-only connections, without exposing their connection strings or silently reconnecting saved profiles.
- Copy actions in the desktop use a bounded, validated native clipboard-write command. The renderer receives no clipboard-read API. Connection strings can be temporarily revealed while editing, and pasted outer whitespace is removed before connection.

## Reproduce

```bash
npm run test:performance
```

The benchmark writes `docs/performance/current.json`, also asserts a bound on mounted cells, and scrolls to document 500 to verify that virtualization does not lose results. `CANOPY_BENCHMARK_LABEL` changes the output filename. The `before` snapshot was captured before the optimization and before the new regression bound was added.

The browser suite verifies sorting, keyboard focus across virtualized rows, reset, stop, and lazy tree expansion. Integration tests use a MongoDB test failpoint to block a read for five seconds, cancel the client operation in under two seconds, and execute a subsequent query successfully. Desktop tests verify that the lazy startup chunks are absent, clipboard copy works, and live session connections survive demo switching and renderer reload.

## References

[React memo](https://react.dev/reference/react/memo) describes how stable props let a memoized result subtree skip unnecessary work. [MongoDB cursor documentation](https://www.mongodb.com/docs/drivers/node/current/crud/query/cursor/) documents AbortSignal support and its connection-closing tradeoff. These references guide implementation; the local measurements above are the verification evidence.

## Remaining limits

The table virtualizes rows, not columns; extremely wide schemas can still create many cells. The document-card view is not virtualized. Deep offset pagination still uses MongoDB `skip` and may be expensive on large collections. No new server index is added automatically. Use filters, indexes, projection, and the query planner to address database-side costs.

## 0.3 follow-up

A separate follow-up run on 2026-10-18 retained 1,489 mounted cells for the same 500 × 60 workload and passed keyboard scrolling to document 500. It measured 872 ms from Run to the result assertion and 228 ms for filter fill plus stale-state assertion (`performance/0.3.json`). These are slower than the earlier 0.2 observations; this task has not established a latency improvement. They include browser automation and should not be interpreted as server execution measurements or statistically comparable percentiles.

The static startup JavaScript graph is 304,615 bytes, versus 304,331 in the retained 0.2 measurement (`performance/startup-0.3.json`). The new pipeline editor and Explain adapter load on demand, without a graph library. The desktop startup test checks that these chunks and the example fixture are absent at the welcome screen. Explain normalizes a bounded tree once per response; selecting a stage does not reparse the server output. Pipeline previews run only on request and never fetch both sides of every stage in the background.
