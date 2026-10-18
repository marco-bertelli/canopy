/** Explain is deliberately permissive: MongoDB does not promise a stable output format. */
export type Doc = Record<string, unknown>;
export interface PlanNode {
  id: string;
  kind: string;
  data: Doc;
  children: PlanNode[];
  output?: number;
  millis?: number;
  index?: string;
}
export interface Finding {
  title: string;
  evidence: string;
  action: string;
  tone: "check" | "info";
  nodeId?: string;
}
export interface ExplainModel {
  roots: PlanNode[];
  nodes: PlanNode[];
  findings: Finding[];
  returned?: number;
  docs?: number;
  keys?: number;
  millis?: number;
  measured: boolean;
  scope: "query" | "cursor" | "unavailable";
}
export const object = (v: unknown): Doc =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Doc) : {};
export function numeric(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const wrapper = object(v);
  const value =
    wrapper.$numberLong ??
    wrapper.$numberInt ??
    wrapper.$numberDouble ??
    wrapper.$numberDecimal;
  if (typeof value !== "string") return;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER
    ? n
    : undefined;
}
export const count = (n?: number) =>
  n === undefined
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(n);
const childKeys = [
  "inputStage",
  "inputStages",
  "outerStage",
  "innerStage",
  "thenStage",
  "elseStage",
  "child",
  "children",
  "leftChild",
  "rightChild",
];
export function describe(kind: string): string {
  const k = kind.toUpperCase();
  if (k.includes("COLLSCAN"))
    return "Reads collection documents to evaluate the query.";
  if (k.includes("IXSCAN") || k === "IXSEEK")
    return "Reads index entries within the reported bounds.";
  if (k.includes("FETCH"))
    return "Loads documents after an index scan, possibly applying another filter.";
  if (k.includes("SORT") && !k.includes("MERGE"))
    return "Orders incoming data. Check whether an index can provide this order.";
  if (k.includes("GROUP")) return "Combines incoming documents into groups.";
  if (k.includes("LOOKUP"))
    return "Joins another collection. Inspect the foreign field and indexes.";
  if (k.includes("LIMIT"))
    return "Stops passing documents after the requested limit.";
  if (k.includes("PROJ")) return "Selects or computes the returned fields.";
  if (k.includes("SHARD"))
    return "Combines or filters work across shards. Branches show reported shard plans.";
  if (k === "$MATCH") return "Keeps documents that satisfy this filter.";
  if (k === "$UNWIND") return "Expands array elements into separate documents.";
  return "A stage reported by MongoDB. Inspect the available evidence below.";
}
export function analyzeExplain(raw: Doc): ExplainModel {
  const nodes: PlanNode[] = [];
  let serial = 0;
  function node(kind: string, data: Doc, children: PlanNode[] = []): PlanNode {
    const n = {
      id: `plan-${++serial}`,
      kind,
      data,
      children,
      output: numeric(data.nReturned),
      millis: numeric(data.executionTimeMillisEstimate),
      index: typeof data.indexName === "string" ? data.indexName : undefined,
    };
    nodes.push(n);
    return n;
  }
  function plan(
    value: unknown,
    execution?: unknown,
    byId = new Map<number, Doc>(),
    depth = 0,
  ): PlanNode | undefined {
    if (depth > 100 || nodes.length > 1000) return;
    const p = object(value),
      e = object(execution);
    if (p.queryPlan) return plan(p.queryPlan, execution, byId, depth + 1);
    if (typeof p.stage !== "string") return;
    const id = numeric(p.planNodeId);
    const stats =
      id !== undefined ? byId.get(id) : p.stage === e.stage ? e : undefined;
    const children: PlanNode[] = [];
    for (const key of childKeys) {
      const values = Array.isArray(p[key])
        ? (p[key] as unknown[])
        : p[key]
          ? [p[key]]
          : [];
      const execValues = Array.isArray(e[key])
        ? (e[key] as unknown[])
        : [e[key]];
      values.forEach((child, i) => {
        const n = plan(child, execValues[i], byId, depth + 1);
        if (n) children.push(n);
      });
    }
    if (Array.isArray(p.shards))
      for (const shard of p.shards) {
        const s = object(shard);
        const executionShard = Array.isArray(e.shards)
          ? e.shards.map(object).find((v) => v.shardName === s.shardName)
          : undefined;
        const found = block({
          queryPlanner: { winningPlan: s.winningPlan },
          executionStats: {
            executionStages:
              executionShard?.executionStages ?? s.executionStages,
          },
        });
        if (found)
          children.push(node(String(s.shardName ?? "Shard"), {}, [found]));
      }
    return node(p.stage, { ...p, ...stats, stage: p.stage }, children);
  }
  function block(b: Doc): PlanNode | undefined {
    if (Array.isArray(b.stages)) {
      let previous: PlanNode | undefined;
      for (const item of b.stages) {
        const s = object(item);
        if (s.$cursor || s.$geoNearCursor)
          previous = block(object(s.$cursor ?? s.$geoNearCursor));
        else {
          const operator = Object.keys(s).find((k) => k.startsWith("$"));
          if (operator)
            previous = node(operator, s, previous ? [previous] : []);
        }
      }
      return previous;
    }
    const stats = object(b.executionStats);
    const byId = new Map<number, Doc>();
    function collect(v: unknown, depth = 0) {
      if (depth > 100) return;
      const o = object(v),
        id = numeric(o.planNodeId);
      // SBE can report several physical stages for one logical node: retain its outermost report.
      if (id !== undefined && !byId.has(id)) byId.set(id, o);
      for (const key of childKeys) {
        const value = o[key];
        if (Array.isArray(value)) value.forEach((c) => collect(c, depth + 1));
        else if (value) collect(value, depth + 1);
      }
    }
    collect(stats.executionStages);
    return plan(
      object(b.queryPlanner).winningPlan ?? stats.executionStages,
      stats.executionStages,
      byId,
    );
  }
  const roots: PlanNode[] = [];
  const root = block(raw);
  if (root) roots.push(root);
  // Aggregation on mongos may report one full pipeline per shard.
  if (!root)
    for (const [name, shard] of Object.entries(object(raw.shards))) {
      const n = block(object(shard));
      if (n) roots.push(node(name, {}, [n]));
    }
  const stages = Array.isArray(raw.stages) ? raw.stages.map(object) : [];
  const cursor = stages.find((s) => s.$cursor || s.$geoNearCursor);
  const rootStats = object(raw.executionStats);
  const cursorStats = object(
    object(cursor?.$cursor ?? cursor?.$geoNearCursor).executionStats,
  );
  const stats = Object.keys(rootStats).length ? rootStats : cursorStats;
  const scope = Object.keys(rootStats).length
    ? "query"
    : Object.keys(cursorStats).length
      ? "cursor"
      : "unavailable";
  const returned = stages.length
    ? numeric(stages.at(-1)?.nReturned)
    : numeric(rootStats.nReturned);
  const docs = numeric(stats.totalDocsExamined),
    keys = numeric(stats.totalKeysExamined);
  const measured =
    Object.keys(stats).length > 0 ||
    stages.some((s) => numeric(s.nReturned) !== undefined) ||
    nodes.some((n) => n.output !== undefined);
  const findings: Finding[] = [];
  const scan = nodes.find((n) => n.kind.toUpperCase().includes("COLLSCAN"));
  if (scan)
    findings.push({
      title: "Collection scan",
      evidence:
        "The winning plan reads collection documents without an index scan at this branch.",
      action:
        "For a selective filter, check an index on its fields. A scan can be reasonable for a small collection or a broad query.",
      tone: "check",
      nodeId: scan.id,
    });
  const sort = nodes.find((n) => /^(SORT|\$sort)$/i.test(n.kind));
  if (sort)
    findings.push({
      title: "Explicit sort",
      evidence: "MongoDB reports a sort stage in the winning plan.",
      action:
        "Check whether a suitable compound index can supply the requested order. Keep only the rows you need when query semantics allow it.",
      tone: "check",
      nodeId: sort.id,
    });
  const disk = nodes.find(
    (n) => n.data.usedDisk === true || (numeric(n.data.spills) ?? 0) > 0,
  );
  if (disk)
    findings.push({
      title: "Disk work reported",
      evidence: "This stage reports usedDisk or spills.",
      action:
        "Inspect the stage input size and memory use. Reduce incoming data where semantics allow; disk work may dominate on larger inputs.",
      tone: "check",
      nodeId: disk.id,
    });
  const sourceReturned = numeric(stats.nReturned);
  const comparable =
    scope === "cursor" ||
    !nodes.some((n) => /GROUP|COUNT|UNWIND|FACET|BUCKET|LOOKUP/i.test(n.kind));
  if (
    comparable &&
    docs !== undefined &&
    sourceReturned !== undefined &&
    docs > 0 &&
    sourceReturned === 0
  )
    findings.push({
      title: "Documents read, no matches",
      evidence: `${count(docs)} documents examined, zero returned by ${scope === "cursor" ? "the source cursor" : "this query"}.`,
      action:
        "Check filter values and BSON types, then inspect index bounds. Zero matches does not imply zero work.",
      tone: "check",
    });
  else if (
    comparable &&
    docs !== undefined &&
    sourceReturned &&
    docs / sourceReturned >= 10
  )
    findings.push({
      title: "Read amplification",
      evidence: `${count(docs / sourceReturned)} documents examined per document returned by ${scope === "cursor" ? "the source cursor" : "this query"}.`,
      action:
        "Inspect residual filters and index bounds. This ratio describes document reads; it is not a latency score.",
      tone: "check",
    });
  if (!measured)
    findings.push({
      title: "Measure before judging cost",
      evidence:
        "This is a planner snapshot; execution counts and timings were not requested.",
      action:
        "Use Run & measure to collect server statistics for the winning plan.",
      tone: "info",
    });
  if (!findings.length)
    findings.push({
      title: "Inspect the work, then compare",
      evidence:
        "No collection scan, explicit sort, or reported spill was identified in the supported stages.",
      action:
        "Review examined keys and documents for your workload. An index scan alone does not establish good performance.",
      tone: "info",
    });
  return {
    roots,
    nodes,
    findings,
    returned,
    docs,
    keys,
    millis: numeric(stats.executionTimeMillis),
    measured,
    scope,
  };
}
