import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Check,
  CircleHelp,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import type { Bridge, Query } from "../../shared/contracts";
import {
  analyzeExplain,
  count,
  describe,
  numeric,
  type Doc,
  type PlanNode,
} from "../lib/explain";
import { Editor } from "./Editor";

function Flow({
  node,
  selected,
  onSelect,
}: {
  node: PlanNode;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <li className="plan-branch">
      {!!node.children.length && (
        <>
          <ul className="plan-children">
            {node.children.map((child) => (
              <Flow
                key={child.id}
                node={child}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </ul>
          <div className="plan-connector">
            <ArrowDown size={12} />
          </div>
        </>
      )}
      <button
        id={node.id}
        className={`plan-node ${selected === node.id ? "selected" : ""} ${/COLLSCAN|^SORT$|^\$sort$/i.test(node.kind) ? "plan-check" : ""}`}
        aria-pressed={selected === node.id}
        onClick={() => onSelect(node.id)}
      >
        <span className="plan-node-type">
          {node.children.length ? "TRANSFORM" : "SOURCE"}
          {/COLLSCAN|^SORT$|^\$sort$/i.test(node.kind) && (
            <AlertTriangle size={12} />
          )}
        </span>
        <strong>{node.kind}</strong>
        {node.index && <code title={node.index}>{node.index}</code>}
        <span className="plan-node-count">
          {node.output === undefined
            ? "Count not reported"
            : `${count(node.output)} out`}
          {node.millis !== undefined && (
            <small>~{count(node.millis)} ms*</small>
          )}
        </span>
      </button>
    </li>
  );
}
const detailKeys = [
  "indexName",
  "keyPattern",
  "indexBounds",
  "filter",
  "sortPattern",
  "direction",
  "isMultiKey",
  "indexesUsed",
  "collectionScans",
  "usedDisk",
  "spills",
  "memLimit",
  "limitAmount",
  "$match",
  "$group",
  "$sort",
  "$project",
  "$lookup",
  "$unwind",
  "$limit",
  "$skip",
];
export default function ExplainPanel({
  api,
  query,
  demo,
  onEdit,
}: {
  api: Bridge;
  query: Query;
  demo: boolean;
  onEdit: () => void;
}) {
  const [raw, setRaw] = useState<Doc>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>();
  const [snapshot, setSnapshot] = useState<Query>();
  const [showRaw, setShowRaw] = useState(false);
  const pending = useRef<
    { id: string; connectionId: string; api: Bridge } | undefined
  >(undefined);
  const generation = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const model = useMemo(() => (raw ? analyzeExplain(raw) : undefined), [raw]);
  const chosen = model?.nodes.find((n) => n.id === selected) ?? model?.roots[0];
  const abort = useCallback(() => {
    const running = pending.current;
    generation.current++;
    pending.current = undefined;
    if (running)
      void running.api
        .call("cancelQuery", {
          requestId: running.id,
          connectionId: running.connectionId,
        })
        .catch(() => {});
  }, []);
  const load = useCallback(
    async (verbosity: "queryPlanner" | "executionStats") => {
      abort();
      const ticket = generation.current;
      setBusy(true);
      setError("");
      const requestId = crypto.randomUUID();
      pending.current = {
        id: requestId,
        connectionId: query.connectionId,
        api,
      };
      try {
        const result = demo
          ? (await import("../explain-example")).examplePlan
          : await api.call("explain", { ...query, requestId, verbosity });
        if (generation.current === ticket) {
          setRaw(result);
          setSnapshot(query);
          setSelected(undefined);
        }
      } catch (e) {
        if (generation.current === ticket)
          setError(
            e instanceof Error ? e.message : "Unable to read the query plan.",
          );
      } finally {
        if (generation.current === ticket) {
          setBusy(false);
          pending.current = undefined;
        }
      }
    },
    [abort, api, query, demo],
  );
  useEffect(() => {
    void load("queryPlanner");
    return abort;
  }, [load, abort]);
  const entries = chosen
    ? [
        ...new Set([
          ...detailKeys,
          ...Object.keys(chosen.data).filter((k) => k.startsWith("$")),
        ]),
      ].filter((k) => chosen.data[k] !== undefined)
    : [];
  const measured = model?.measured;
  function locate(id: string) {
    setSelected(id);
    const element = container.current?.querySelector<HTMLButtonElement>(
      `#${id}`,
    );
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    element?.focus({ preventScroll: true });
  }
  return (
    <div className="explain-workspace" ref={container}>
      <div className="explain-heading">
        <div>
          <span className="eyebrow">QUERY DIAGNOSTICS</span>
          <h2>See where the work happens.</h2>
          <p>Follow the winning plan from its sources to the result.</p>
        </div>
        <button className="text-button" onClick={onEdit}>
          <ArrowLeft size={14} />
          Edit {query.mode === "aggregate" ? "pipeline" : "query"}
        </button>
      </div>
      {demo && (
        <div className="explain-example">
          <CircleHelp size={16} />
          <span>
            <strong>Illustrative example</strong> · These fixed numbers describe
            an example orders query, not your sample data or current query.
            Connect to MongoDB to analyze your own query.
          </span>
        </div>
      )}
      <div className="explain-controls">
        <div>
          <span className={`badge ${measured ? "green" : "neutral"}`}>
            {demo
              ? "EXAMPLE"
              : measured
                ? "EXECUTION STATS"
                : "PLANNER SNAPSHOT"}
          </span>
          <span>
            {demo
              ? "Example · orders with status paid · latest 25"
              : query.mode === "aggregate"
                ? "Complete enabled pipeline · no page limit"
                : `Find page · skip ${query.skip}, limit ${query.limit}`}
          </span>
        </div>
        <div>
          <button
            className="button"
            disabled={busy}
            onClick={() => void load("queryPlanner")}
          >
            <RefreshCw size={13} />
            {demo ? "Reload example" : "Refresh plan"}
          </button>
          {busy ? (
            <button
              className="button"
              onClick={() => {
                abort();
                setBusy(false);
                setError(
                  "Explain cancelled. The previous snapshot is retained.",
                );
              }}
            >
              <Square size={13} />
              Stop explain
            </button>
          ) : (
            <button
              className="button primary"
              disabled={demo}
              onClick={() => void load("executionStats")}
            >
              <Play size={13} />
              Run & measure
            </button>
          )}
        </div>
      </div>
      <p className="explain-scope">
        {demo
          ? "Explore the plan below to see the diagnostic workflow."
          : "Run & measure executes this read on MongoDB · 15 s server limit."}
      </p>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="explain-progress" role="status">
          <Loader2 size={15} className="spin" />
          Reading the server plan… {raw && "Previous snapshot remains below."}
        </div>
      )}
      {model && (
        <>
          {!!raw?.splitPipeline && (
            <p className="explain-scope">
              Shard branches are shown below. The split merger definition is
              available in Server output and is not expanded in this diagram.
            </p>
          )}
          <div className="explain-metrics" aria-label="Explain measurements">
            {[
              ["Documents out", model.returned, "Final reported output"],
              [
                model.scope === "cursor"
                  ? "Source docs read"
                  : "Documents read",
                model.docs,
                "Documents examined",
              ],
              [
                model.scope === "cursor"
                  ? "Source keys read"
                  : "Index keys read",
                model.keys,
                "Index entries examined",
              ],
              [
                model.scope === "cursor" ? "Cursor time" : "Server time",
                model.millis,
                "Plan selection + execution; excludes client transport",
              ],
            ].map(([label, value, hint]) => (
              <div key={String(label)} title={String(hint)}>
                <span>{label}</span>
                <strong>
                  {count(value as number | undefined)}
                  {value !== undefined &&
                    String(label).toLowerCase().includes("time") && (
                      <small> ms</small>
                    )}
                </strong>
                <small>{value === undefined ? "Not reported" : hint}</small>
              </div>
            ))}
          </div>
          <div className="explain-analysis">
            <div className="plan-surface">
              <div className="plan-surface-heading">
                <span>
                  <GitBranch size={14} />
                  Winning plan
                </span>
                <small>Sources → result · select a stage</small>
              </div>
              {model.roots.length ? (
                <div className="plan-scroll">
                  <ul className="plan-children plan-roots">
                    {model.roots.map((root) => (
                      <Flow
                        key={root.id}
                        node={root}
                        selected={chosen?.id}
                        onSelect={setSelected}
                      />
                    ))}
                  </ul>
                  <div className="plan-result">
                    <Check size={12} />
                    RESULT
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <GitBranch size={26} />
                  <h3>This plan has an unfamiliar structure</h3>
                  <p>
                    Use server output below to inspect fields this version does
                    not visualize.
                  </p>
                </div>
              )}
              <p className="plan-footnote">
                * Stage times are server estimates, may overlap, and are not
                added together.
                {model.scope === "cursor" &&
                  " Read counts and time above describe the source cursor, not all pipeline stages."}
              </p>
            </div>
            <aside className="plan-detail" aria-label="Selected plan stage">
              {chosen ? (
                <>
                  <span className="eyebrow">SELECTED STAGE</span>
                  <h3>{chosen.kind}</h3>
                  <p>{describe(chosen.kind)}</p>
                  <dl>
                    {[
                      ["Documents out", chosen.output],
                      [
                        "Documents examined",
                        numeric(
                          chosen.data.docsExamined ??
                            chosen.data.totalDocsExamined,
                        ),
                      ],
                      [
                        "Keys examined",
                        numeric(
                          chosen.data.keysExamined ??
                            chosen.data.totalKeysExamined,
                        ),
                      ],
                      ["Time estimate", chosen.millis],
                    ].map(([label, v]) => (
                      <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd>
                          {count(v as number | undefined)}
                          {v !== undefined && label === "Time estimate"
                            ? " ms*"
                            : ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {entries.map((key) => (
                    <div className="plan-evidence" key={key}>
                      <span>{key}</span>
                      <pre>
                        {typeof chosen.data[key] === "string"
                          ? String(chosen.data[key])
                          : JSON.stringify(chosen.data[key], null, 2)}
                      </pre>
                    </div>
                  ))}
                  <p className="plan-footnote">
                    An em dash means MongoDB did not report this measurement for
                    this stage.
                  </p>
                </>
              ) : (
                <p>No supported stage was reported.</p>
              )}
            </aside>
          </div>
          <section className="explain-findings">
            <h3>
              What to check next <span>{model.findings.length}</span>
            </h3>
            <div>
              {model.findings.map((f) => (
                <article key={f.title}>
                  <div className={`finding-icon ${f.tone}`}>
                    {f.tone === "check" ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <CircleHelp size={16} />
                    )}
                  </div>
                  <div>
                    <h4>{f.title}</h4>
                    <p>{f.evidence}</p>
                    <p className="finding-action">{f.action}</p>
                    {f.nodeId && (
                      <button
                        className="text-button"
                        onClick={() => locate(f.nodeId!)}
                      >
                        Locate stage <ArrowDown size={12} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
          <p className="explain-scope">
            Explain chooses a plan outside the normal plan cache. Timing is not
            a prediction of cached query latency.
          </p>
          <details className="explain-source">
            <summary>Query snapshot</summary>
            <pre>
              {JSON.stringify(
                demo
                  ? raw?.command
                  : snapshot?.mode === "aggregate"
                    ? {
                        pipeline: JSON.parse(snapshot.pipeline),
                        disabledStages: snapshot.pipelineDisabled ?? [],
                      }
                    : {
                        filter: snapshot?.filter,
                        projection: snapshot?.projection,
                        sort: snapshot?.sort,
                        skip: snapshot?.skip,
                        limit: snapshot?.limit,
                      },
                null,
                2,
              )}
            </pre>
          </details>
          <details
            className="explain-source"
            onToggle={(e) => setShowRaw(e.currentTarget.open)}
          >
            <summary>Server output · advanced</summary>
            {showRaw && (
              <Editor
                value={JSON.stringify(raw, null, 2)}
                height="280px"
                readOnly
                label="Query explain plan"
              />
            )}
          </details>
        </>
      )}
    </div>
  );
}
