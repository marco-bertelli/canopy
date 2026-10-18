import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Braces,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  FileJson,
  Hash,
  Info,
  Loader2,
  Play,
  Rows2,
  Square,
  Table2,
} from "lucide-react";
import type { Bridge, Query, StageSide } from "../../shared/contracts";
import {
  exactCount,
  sides,
  StagePageCache,
  stageContext,
  type StagePage,
} from "../lib/aggregation";
import { Editor } from "./Editor";
import { Modal } from "./Modal";
import { ResultsTable } from "./ResultsTable";
import { ValueTree } from "./Values";

type Kind = "preview" | "count";
interface Count {
  scope: string;
  value: string;
  duration: number;
}
interface PaneState {
  page?: StagePage;
  count?: Count;
  busy: boolean;
  counting: boolean;
  error?: string;
  status?: string;
  view: "table" | "tree" | "json";
}
const emptyPane = (): PaneState => ({
  busy: false,
  counting: false,
  view: "table",
});
interface Job {
  id: string;
  api: Bridge;
  connectionId: string;
}
export interface StageComparisonHandle {
  run: (side?: StageSide) => void;
}
export default forwardRef<
  StageComparisonHandle,
  {
    api: Bridge;
    query: Query;
    stage: number;
    onSelect: (stage: number) => void;
    visible: boolean;
  }
>(function StageComparison({ api, query, stage, onSelect, visible }, ref) {
  const context = useMemo(
    () => stageContext(query, stage),
    [
      query.pipeline,
      query.pipelineDisabled,
      query.connectionId,
      query.database,
      query.collection,
      stage,
    ],
  );
  const current = useRef({ context, query, api });
  current.current = { context, query, api };
  const [panes, setPanes] = useState<Record<StageSide, PaneState>>({
    input: emptyPane(),
    output: emptyPane(),
  });
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const cache = useRef(new StagePageCache());
  const counts = useRef(new Map<string, Count>());
  const jobs = useRef(new Map<string, Job>());
  const mirrored = useRef<string | undefined>(undefined);
  const lastStage = useRef(stage);
  const lastConnection = useRef(api);
  const previousScopes = useRef<{
    input?: string;
    output?: string;
    limit?: number;
  }>({});
  const [layout, setLayout] = useState<"side" | "stacked">("side");
  const [inspection, setInspection] = useState<{
    side: StageSide;
    row: number;
    document: Record<string, unknown>;
    original: string;
  }>();
  const patch = useCallback(
    (side: StageSide, changes: Partial<PaneState>) =>
      setPanes((all) => ({ ...all, [side]: { ...all[side], ...changes } })),
    [],
  );
  const cancel = useCallback((side: StageSide, kind: Kind) => {
    const key = `${side}:${kind}`,
      job = jobs.current.get(key);
    jobs.current.delete(key);
    if (job)
      void job.api
        .call("cancelQuery", {
          connectionId: job.connectionId,
          requestId: job.id,
        })
        .catch(() => {});
    if (side === "output" && kind === "preview") mirrored.current = undefined;
  }, []);
  const cancelAll = useCallback(() => {
    for (const side of sides) {
      cancel(side, "preview");
      cancel(side, "count");
    }
  }, [cancel]);
  useEffect(() => cancelAll, [cancelAll]);
  useLayoutEffect(() => {
    const switched =
      lastStage.current !== stage || lastConnection.current !== api;
    const affected = Object.fromEntries(
      sides.map((side) => [
        side,
        switched ||
          previousScopes.current[side] !== context?.[side].key ||
          previousScopes.current.limit !== query.limit,
      ]),
    ) as Record<StageSide, boolean>;
    for (const side of sides)
      if (affected[side]) {
        cancel(side, "preview");
        cancel(side, "count");
      }
    if (lastConnection.current !== api) {
      cache.current = new StagePageCache();
      counts.current.clear();
    }
    lastStage.current = stage;
    lastConnection.current = api;
    previousScopes.current = {
      input: context?.input.key,
      output: context?.output.key,
      limit: query.limit,
    };
    setPanes(
      (all) =>
        Object.fromEntries(
          sides.map((side) => {
            if (!affected[side]) return [side, all[side]];
            const scope = context?.[side].key;
            return [
              side,
              {
                ...all[side],
                page: scope
                  ? (cache.current.get(scope, query.limit, 0) ??
                    (switched ? undefined : all[side].page))
                  : switched
                    ? undefined
                    : all[side].page,
                count: scope ? counts.current.get(scope) : undefined,
                busy: false,
                counting: false,
                error: undefined,
                status: undefined,
              },
            ];
          }),
        ) as Record<StageSide, PaneState>,
    );
    setInspection(undefined);
  }, [
    stage,
    context?.input.key,
    context?.output.key,
    query.limit,
    api,
    cancel,
  ]);
  useEffect(() => {
    if (!visible) {
      cancelAll();
      setPanes((all) => ({
        input: { ...all.input, busy: false, counting: false },
        output: { ...all.output, busy: false, counting: false },
      }));
    }
  }, [visible, cancelAll]);
  async function fetchPage(
    side: StageSide,
    skip = 0,
  ): Promise<StagePage | undefined> {
    const { context: c, query: q, api: bridge } = current.current;
    if (!c) return;
    cancel(side, "preview");
    const id = crypto.randomUUID(),
      key = `${side}:preview`,
      scope = c[side].key;
    jobs.current.set(key, { id, api: bridge, connectionId: q.connectionId });
    patch(side, { busy: true, error: undefined, status: undefined });
    try {
      const result = await bridge.call("previewStage", {
        ...q,
        requestId: id,
        stage: c.index,
        side,
        mode: "aggregate",
        skip,
      });
      if (
        jobs.current.get(key)?.id !== id ||
        current.current.context?.[side].key !== scope
      )
        return;
      const page = { result, scope, limit: q.limit, skip, at: Date.now() };
      cache.current.set(page);
      patch(side, { page, busy: false });
      return page;
    } catch (e) {
      if (jobs.current.get(key)?.id === id)
        patch(side, {
          busy: false,
          error:
            e instanceof Error ? e.message : "Unable to inspect this stage.",
        });
    } finally {
      if (jobs.current.get(key)?.id === id) jobs.current.delete(key);
    }
  }
  function run(side?: StageSide) {
    if (side) {
      void fetchPage(side);
      return;
    }
    const c = current.current.context;
    if (!c) return;
    if (c.input.key !== c.output.key) {
      void fetchPage("input");
      void fetchPage("output");
      return;
    }
    // A bypassed stage is an identity operation: show the very same input read on both sides.
    cancel("output", "preview");
    const token = crypto.randomUUID();
    mirrored.current = token;
    patch("output", { busy: true, error: undefined, status: undefined });
    void fetchPage("input").then((page) => {
      if (
        mirrored.current !== token ||
        current.current.context?.output.key !== c.output.key
      )
        return;
      mirrored.current = undefined;
      patch("output", {
        ...(page
          ? { page }
          : { status: "Input was not refreshed. Run the stage again." }),
        busy: false,
      });
    });
  }
  useImperativeHandle(ref, () => ({ run }));
  async function countAll(side: StageSide) {
    const { context: c, query: q, api: bridge } = current.current;
    if (!c) return;
    cancel(side, "count");
    const id = crypto.randomUUID(),
      key = `${side}:count`,
      scope = c[side].key;
    jobs.current.set(key, { id, api: bridge, connectionId: q.connectionId });
    patch(side, { counting: true, error: undefined, status: undefined });
    try {
      const result = await bridge.call("countStage", {
        ...q,
        requestId: id,
        stage: c.index,
        side,
        mode: "aggregate",
      });
      if (
        jobs.current.get(key)?.id !== id ||
        current.current.context?.[side].key !== scope
      )
        return;
      const count = { scope, value: result.count, duration: result.duration };
      counts.current.delete(scope);
      counts.current.set(scope, count);
      while (counts.current.size > 12)
        counts.current.delete(counts.current.keys().next().value!);
      patch(side, { count, counting: false });
    } catch (e) {
      if (jobs.current.get(key)?.id === id)
        patch(side, {
          counting: false,
          error:
            e instanceof Error ? e.message : "Unable to count this prefix.",
        });
    } finally {
      if (jobs.current.get(key)?.id === id) jobs.current.delete(key);
    }
  }
  function stop(side: StageSide) {
    cancel(side, "preview");
    cancel(side, "count");
    patch(side, {
      busy: false,
      counting: false,
      status: "Stopped · previous data retained",
    });
    if (side === "input" && mirrored.current) {
      mirrored.current = undefined;
      patch("output", {
        busy: false,
        status: "Stopped · previous data retained",
      });
    }
  }
  const inputCount =
    panes.input.count?.scope === context?.input.key
      ? panes.input.count
      : undefined;
  const outputCount =
    panes.output.count?.scope === context?.output.key
      ? panes.output.count
      : undefined;
  return (
    <section
      className={`stage-comparison ${layout}`}
      hidden={!visible}
      aria-label="Stage input and output"
    >
      <div className="stage-comparison-heading">
        <div className="stage-location">
          <label htmlFor="inspect-stage">Inspect</label>
          <button
            className="icon-button"
            aria-label="Previous stage"
            disabled={!context || stage === 0}
            onClick={() => onSelect(stage - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <select
            id="inspect-stage"
            aria-label="Stage to inspect"
            value={context ? stage : ""}
            disabled={!context}
            onChange={(e) => onSelect(Number(e.target.value))}
          >
            {context ? (
              context.stages.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}. {s.operator}
                  {s.disabled ? " · disabled" : ""}
                </option>
              ))
            ) : (
              <option value="">Select a valid stage</option>
            )}
          </select>
          <button
            className="icon-button"
            aria-label="Next stage"
            disabled={!context || stage >= context.stages.length - 1}
            onClick={() => onSelect(stage + 1)}
          >
            <ChevronRight size={14} />
          </button>
          {context?.disabled && <span className="badge neutral">BYPASSED</span>}
        </div>
        <button
          className={`button small ${panes.input.busy || panes.output.busy ? "" : "primary"}`}
          disabled={!context}
          onClick={() => {
            if (panes.input.busy || panes.output.busy) {
              stop("input");
              stop("output");
            } else run();
          }}
        >
          {panes.input.busy || panes.output.busy ? (
            <Square size={12} />
          ) : (
            <Play size={12} />
          )}{" "}
          {panes.input.busy || panes.output.busy ? "Stop stage" : "Run stage"}
        </button>
        <div className="stage-count-flow">
          {inputCount && outputCount ? (
            <>
              <strong>{exactCount(inputCount.value)}</strong>
              <ArrowRight size={13} />
              <strong>{exactCount(outputCount.value)}</strong>
              <span>documents</span>
            </>
          ) : (
            <span>Input and output · page samples</span>
          )}
        </div>
        <div
          className="view-switch"
          role="group"
          aria-label="Stage data layout"
        >
          <button
            className={layout === "side" ? "active" : ""}
            aria-label="Side by side"
            aria-pressed={layout === "side"}
            onClick={() => setLayout("side")}
          >
            <Columns2 size={14} />
          </button>
          <button
            className={layout === "stacked" ? "active" : ""}
            aria-label="Stack vertically"
            aria-pressed={layout === "stacked"}
            onClick={() => setLayout("stacked")}
          >
            <Rows2 size={14} />
          </button>
        </div>
      </div>
      {!context && (
        <div className="stage-invalid" role="status">
          Select a stage with valid JSON to load its input and output.
        </div>
      )}
      <div className="stage-data-grid">
        {sides.map((side) => (
          <StageDataPane
            key={`${stage}-${side}`}
            side={side}
            state={panes[side]}
            label={context?.[side].label ?? "Pipeline changed"}
            stage={stage}
            scope={context?.[side].key}
            limit={query.limit}
            onRun={() => {
              if (side === "output" && context?.disabled) run();
              else run(side);
            }}
            onStop={() => stop(side)}
            onCount={() => void countAll(side)}
            onPage={(skip) => void fetchPage(side, skip)}
            onView={(view) => patch(side, { view })}
            onInspect={(row) => {
              const page = panesRef.current[side].page;
              if (page)
                setInspection({
                  side,
                  row: page.skip + row + 1,
                  document: page.result.documents[row],
                  original: page.result.originals[row],
                });
            }}
          />
        ))}
      </div>
      <p className="stage-data-note">
        <Info size={12} />
        <span>
          Each side reads its full pipeline prefix, then displays a page. Counts
          run separately; concurrent writes or $sample can change results
          between reads.
        </span>
      </p>
      {inspection && (
        <Modal
          title={`Stage ${stage + 1} ${inspection.side} · document ${inspection.row}`}
          subtitle="Read-only stage snapshot"
          wide
          onClose={() => setInspection(undefined)}
        >
          <div className="stage-document-inspector">
            <ValueTree value={inspection.document} />
            <button
              className="button"
              onClick={() =>
                void api
                  .call("copyText", { text: inspection.original })
                  .catch(() =>
                    patch(inspection.side, {
                      error: "Copy failed. Use the JSON view to copy manually.",
                    }),
                  )
              }
            >
              <Copy size={13} />
              Copy Extended JSON
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
});

function StageDataPane({
  side,
  state,
  label,
  stage,
  scope,
  limit,
  onRun,
  onStop,
  onCount,
  onPage,
  onView,
  onInspect,
}: {
  side: StageSide;
  state: PaneState;
  label: string;
  stage: number;
  scope?: string;
  limit: number;
  onRun: () => void;
  onStop: () => void;
  onCount: () => void;
  onPage: (skip: number) => void;
  onView: (view: PaneState["view"]) => void;
  onInspect: (row: number) => void;
}) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  useEffect(() => setSelectedRow(null), [state.page]);
  const page = state.page,
    result = page?.result;
  const stale = !!page && (page.scope !== scope || page.limit !== limit);
  const count = state.count?.scope === scope ? state.count : undefined;
  const fields = useMemo(() => {
    const keys = [...new Set(result?.documents.flatMap(Object.keys) ?? [])];
    const id = result?.documents[0]?._id;
    return id && typeof id === "object" && "$oid" in id
      ? [...keys.filter((k) => k !== "_id"), "_id"]
      : keys;
  }, [result]);
  const json = useMemo(
    () => (result ? JSON.stringify(result.documents, null, 2) : "[]"),
    [result],
  );
  const selected = useCallback(
    (row: number) => {
      setSelectedRow(row);
      onInspect(row);
    },
    [onInspect],
  );
  const noSort = useCallback(() => {}, []);
  return (
    <section
      className={`stage-data-pane ${side}`}
      aria-label={`Stage ${stage + 1} ${side}`}
    >
      <div className="stage-data-heading">
        <div>
          <span className="stage-side-label">
            {side === "input" ? "INPUT" : "OUTPUT"}
          </span>
          <span title={label}>{label}</span>
        </div>
        <button
          className="text-button"
          title={side === "input" ? "Run input (F6)" : "Run output (F7)"}
          disabled={!scope && !state.busy && !state.counting}
          onClick={state.busy || state.counting ? onStop : onRun}
        >
          {state.busy || state.counting ? (
            <Square size={12} />
          ) : (
            <Play size={12} />
          )}{" "}
          {state.busy || state.counting ? "Stop" : "Run"}
        </button>
      </div>
      <div className="stage-data-toolbar">
        <div className="stage-page-sample">
          {result ? (
            <>
              <strong>
                {result.documents.length}
                {result.hasMore ? "+" : ""}
              </strong>
              <span>in page</span>
            </>
          ) : (
            <span>Not loaded</span>
          )}
          {count && (
            <span
              className="stage-total"
              title={`Full prefix count · ${count.duration} ms`}
            >
              <strong>{exactCount(count.value)}</strong> total
            </span>
          )}
        </div>
        <button
          className="text-button stage-count-button"
          disabled={!scope || state.counting}
          onClick={onCount}
        >
          {state.counting ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <Hash size={12} />
          )}
          Count all
        </button>
        <div
          className="view-switch"
          role="group"
          aria-label={`${side} data view`}
        >
          {(
            [
              ["table", Table2, "Table"],
              ["tree", Braces, "Tree"],
              ["json", FileJson, "JSON"],
            ] as const
          ).map(([view, Icon, name]) => (
            <button
              key={view}
              aria-label={name}
              aria-pressed={state.view === view}
              className={state.view === view ? "active" : ""}
              onClick={() => onView(view)}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>
      {stale && (
        <div className="stage-stale" role="status">
          Prefix changed · run to update this sample
        </div>
      )}
      {state.error && (
        <div className="stage-side-error" role="alert">
          {state.error}
        </div>
      )}
      {state.status && (
        <div className="stage-side-status" role="status">
          {state.status}
        </div>
      )}
      <div className="stage-data-body" aria-busy={state.busy}>
        {state.busy && (
          <div className="stage-refreshing" role="status">
            <Loader2 size={13} className="spin" />
            Reading {side}…
          </div>
        )}
        {result ? (
          result.documents.length ? (
            state.view === "table" ? (
              <ResultsTable
                documents={result.documents}
                fields={fields}
                compact
                selected={selectedRow}
                onNavigate={setSelectedRow}
                offset={page?.skip ?? 0}
                sort="{}"
                sortable={false}
                onSelect={selected}
                onSort={noSort}
              />
            ) : state.view === "json" ? (
              <div className="stage-json">
                <Editor
                  value={json}
                  readOnly
                  label={`${side} stage JSON`}
                  height="100%"
                />
              </div>
            ) : (
              <div className="stage-tree">
                {result.documents.map((doc, i) => (
                  <div className="stage-tree-document" key={i}>
                    <span>Document {(page?.skip ?? 0) + i + 1}</span>
                    <ValueTree value={doc} />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="stage-pane-empty">
              <Braces size={21} />
              <strong>No {side} documents</strong>
              <span>
                {side === "output"
                  ? "Check this stage and the stages before it."
                  : "The preceding pipeline returned no documents."}
              </span>
            </div>
          )
        ) : (
          <div className="stage-pane-empty">
            <span className="stage-empty-symbol">
              {side === "input" ? "IN" : "OUT"}
            </span>
            <strong>
              {side === "input" ? "Before this stage" : "After this stage"}
            </strong>
            <span>
              {side === "input"
                ? "See the documents this stage receives."
                : "See what the transformation produces."}
            </span>
            <button
              className="button small"
              disabled={!scope || state.busy}
              onClick={onRun}
            >
              <Play size={12} />
              Run {side}
            </button>
          </div>
        )}
      </div>
      <div className="stage-data-footer">
        <span>
          {result?.documents.length
            ? `${(page?.skip ?? 0) + 1}–${(page?.skip ?? 0) + result.documents.length}`
            : "0 documents"}
          {result && (
            <small
              title={`Snapshot read at ${new Date(page!.at).toLocaleTimeString()}`}
            >
              {result.duration} ms · read{" "}
              {new Date(page!.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          )}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={!page || !page.skip || state.busy || stale}
            onClick={() => onPage(Math.max(0, page!.skip - limit))}
          >
            <ChevronLeft size={13} />
          </button>
          <span>{Math.floor((page?.skip ?? 0) / limit) + 1}</span>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={!result?.hasMore || state.busy || stale}
            onClick={() => onPage((page?.skip ?? 0) + limit)}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}
