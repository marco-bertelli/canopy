import { Aggregator } from "mingo";
import "mingo/init/system";
import { EJSON, ObjectId, Decimal128 } from "bson";
import type {
  Bridge,
  CollectionInfo,
  Connection,
  Namespace,
  Query,
  QueryResult,
  StageRequest,
  SchemaField,
  Workspace,
} from "../shared/contracts";
import {
  canonical,
  parseObject,
  enabledPipeline,
  stageQuery,
  transport,
} from "../shared/json";
const names = [
  "Sofia Chen",
  "James Wilson",
  "Ava Rossi",
  "Noah Williams",
  "Mia Patel",
  "Luca Moretti",
  "Emma Davis",
  "Oliver Kim",
  "Amelia Garcia",
  "Ethan Brown",
  "Isabella Martin",
  "Leo Andersson",
  "Charlotte Lee",
  "Henry Müller",
  "Harper Taylor",
  "Aria Nakamura",
];
const countries = [
  "Italy",
  "United States",
  "United Kingdom",
  "Germany",
  "Japan",
  "Sweden",
  "Canada",
  "France",
];
const seed = () => ({
  customers: Array.from({ length: 64 }, (_, i) => ({
    _id: new ObjectId((i + 1).toString(16).padStart(24, "0")),
    name: names[i % names.length],
    email: `${names[i % names.length].toLowerCase().replace(" ", ".")}${i >= 16 ? i : ""}@example.com`,
    status: i % 7 === 0 ? "inactive" : "active",
    plan: ["Pro", "Team", "Free", "Pro"][i % 4],
    country: countries[i % countries.length],
    orders: (i * 7 + 3) % 42,
    joined_at: new Date(Date.UTC(2026, 4, 1 + i)),
    preferences: { newsletter: i % 3 === 0, language: "en" },
    tags: i % 2 ? ["returning"] : ["early-adopter", "newsletter"],
  })),
  orders: Array.from({ length: 48 }, (_, i) => ({
    _id: new ObjectId((100 + i).toString(16).padStart(24, "0")),
    customer_id: new ObjectId(((i % 64) + 1).toString(16).padStart(24, "0")),
    number: `ORD-${1040 + i}`,
    status: ["completed", "shipped", "pending"][i % 3],
    total: Decimal128.fromString(`${29 + i * 3}.90`),
    currency: "EUR",
    created_at: new Date(Date.UTC(2026, 8, 1 + i)),
    items: [{ sku: "CAN-001", quantity: (i % 3) + 1 }],
  })),
  products: Array.from({ length: 12 }, (_, i) => ({
    _id: new ObjectId((200 + i).toString(16).padStart(24, "0")),
    name: [
      "Everyday notebook",
      "Desk mat",
      "Mechanical keyboard",
      "Ceramic mug",
      "Canvas tote",
      "Monitor stand",
    ][i % 6],
    sku: `CAN-${String(i + 1).padStart(3, "0")}`,
    price: 19 + i * 5,
    stock: 12 + i * 8,
    available: i !== 4,
  })),
  events: Array.from({ length: 20 }, (_, i) => ({
    _id: new ObjectId((300 + i).toString(16).padStart(24, "0")),
    type: ["page_view", "sign_up", "purchase"][i % 3],
    timestamp: new Date(Date.UTC(2026, 9, 16, 10, i)),
    metadata: { source: "website" },
  })),
});
export const demoConnection: Connection = {
  id: "demo",
  name: "Sample workspace",
  color: "#65bc9a",
  environment: "local",
  readOnly: false,
  host: "In-memory sample data",
  saved: false,
};
const data: Record<
  string,
  Record<string, Record<string, any>[]>
> = Object.assign(Object.create(null), {
  sample_store: Object.assign(Object.create(null), seed()),
});
const indexes: Record<string, any[]> = Object.create(null);
let workspace: Workspace = { saved: [], history: [] };
try {
  const saved = localStorage.getItem("canopy-demo-workspace");
  if (saved) workspace = JSON.parse(saved);
} catch {
  /* A fresh sample is always available. */
}
function persist() {
  try {
    localStorage.setItem("canopy-demo-workspace", JSON.stringify(workspace));
  } catch {
    /* Private browsing can disable persistence. */
  }
}
function docs(p: Namespace) {
  if (!data[p.database]?.[p.collection])
    throw new Error("Collection not found.");
  return data[p.database][p.collection];
}
function native(text: string) {
  return EJSON.parse(text || "{}", { relaxed: true });
}
async function dispatch(command: string, p: any): Promise<any> {
  switch (command) {
    case "boot":
      return {
        connections: [demoConnection],
        secureStorage: false,
        activeConnections: ["demo"],
      };
    case "connect":
      throw new Error(
        "Live MongoDB connections are available in the desktop app. Run npm run dev to open Canopy.",
      );
    case "reconnect":
      return demoConnection;
    case "disconnect":
      return;
    case "forgetConnection":
      return;
    case "databases":
      return Object.keys(data).sort();
    case "collections":
      return Object.keys(data[p.database] || {})
        .sort()
        .map((name) => ({ name, type: "collection" }) satisfies CollectionInfo);
    case "previewStage":
      return dispatch("query", {
        ...stageQuery(p as StageRequest),
        previewOnly: true,
      });
    case "countStage": {
      const started = performance.now();
      const q = stageQuery(p as StageRequest);
      const stages = native(
        JSON.stringify(transport(enabledPipeline(q.pipeline))),
      );
      const result = new Aggregator([...stages, { $count: "count" }]).run(
        docs(q),
      );
      return {
        count: String(result[0]?.count ?? 0),
        duration: Math.max(1, Math.round(performance.now() - started)),
      };
    }
    case "query": {
      const start = performance.now();
      const q = p as Query;
      parseObject(q.filter, "Filter");
      parseObject(q.projection, "Projection");
      parseObject(q.sort, "Sort");
      const stages =
        q.mode === "aggregate"
          ? native(
              JSON.stringify(
                transport(enabledPipeline(q.pipeline, q.pipelineDisabled)),
              ),
            )
          : [
              { $match: native(q.filter) },
              ...(q.sort.trim() !== "{}" ? [{ $sort: native(q.sort) }] : []),
              ...(q.projection.trim() !== "{}"
                ? [{ $project: native(q.projection) }]
                : []),
            ];
      // Validate read-only stages above; Mingo runs on an isolated sample, never a live database.
      const rows = new Aggregator([
        ...stages,
        { $skip: q.skip },
        { $limit: q.limit + 1 },
      ]).run(docs(q));
      const sliced = rows.slice(0, q.limit);
      const result: QueryResult = {
        documents: transport(sliced),
        originals: sliced.map(canonical),
        hasMore: rows.length > q.limit,
        duration: Math.max(1, Math.round(performance.now() - start)),
        readOnly:
          q.mode === "aggregate" ||
          Object.keys(native(q.projection)).length > 0,
      };
      if (!p.previewOnly) {
        workspace.history.unshift({
          id: crypto.randomUUID(),
          query: { ...q, requestId: undefined },
          createdAt: new Date().toISOString(),
          count: sliced.length,
          duration: result.duration,
        });
        workspace.history = workspace.history.slice(0, 100);
        persist();
      }
      return result;
    }
    case "explain":
      throw new Error(
        "Explain plans come from MongoDB. Connect to a live server in the desktop app to inspect one.",
      );
    case "schema": {
      const rows = docs(p).slice(0, 200);
      const fields = new Map<string, SchemaField>();
      function walk(d: any, prefix = "", depth = 0) {
        if (depth > 8) return;
        for (const [key, v] of Object.entries(d)) {
          const path = prefix ? `${prefix}.${key}` : key;
          const t =
            v === null
              ? "null"
              : Array.isArray(v)
                ? "array"
                : v instanceof Date
                  ? "date"
                  : typeof v === "object" && "_bsontype" in v
                    ? String((v as any)._bsontype)
                    : typeof v;
          const f = fields.get(path) || {
            path,
            types: {},
            present: 0,
            total: rows.length,
          };
          f.present++;
          f.types[t] = (f.types[t] || 0) + 1;
          fields.set(path, f);
          if (t === "object") walk(v, path, depth + 1);
        }
      }
      rows.forEach((d) => walk(d));
      return [...fields.values()].sort((a, b) => a.path.localeCompare(b.path));
    }
    case "indexes":
      return (
        indexes[`${p.database}/${p.collection}`] || [
          { name: "_id_", key: { _id: 1 }, unique: true },
          ...(p.database === "sample_store" && p.collection === "customers"
            ? [
                { name: "email_1", key: { email: 1 }, unique: true },
                { name: "status_1_plan_1", key: { status: 1, plan: 1 } },
              ]
            : []),
        ]
      );
    case "createIndex": {
      const keys = native(p.keys);
      if (!Object.keys(keys).length) throw new Error("Add at least one field.");
      const existing = await dispatch("indexes", p);
      const name =
        p.name ||
        Object.entries(keys)
          .map(([k, v]) => `${k}_${v}`)
          .join("_");
      if (existing.some((i: any) => i.name === name))
        throw new Error("An index with this name already exists.");
      indexes[`${p.database}/${p.collection}`] = [
        ...existing,
        { name, key: keys, unique: p.unique },
      ];
      return name;
    }
    case "dropIndex":
      if (p.name === "_id_")
        throw new Error("The _id index cannot be removed.");
      indexes[`${p.database}/${p.collection}`] = (
        await dispatch("indexes", p)
      ).filter((i: any) => i.name !== p.name);
      return;
    case "insert": {
      const value = EJSON.parse(p.documents, { relaxed: false });
      const rows = Array.isArray(value) ? value : [value];
      if (
        !rows.length ||
        rows.length > 1000 ||
        rows.some((d) => !d || typeof d !== "object" || Array.isArray(d))
      )
        throw new Error("Insert an object or an array of objects.");
      const collection = docs(p);
      for (const d of rows) {
        if (d._id === undefined) d._id = new ObjectId();
        if (collection.some((x) => canonical(x._id) === canonical(d._id)))
          throw new Error("Duplicate _id.");
        collection.push(d);
      }
      return { count: rows.length };
    }
    case "replace":
    case "delete": {
      const rows = docs(p);
      const at = rows.findIndex((d) => canonical(d) === p.original);
      if (at < 0)
        throw new Error("This document changed. Refresh before trying again.");
      if (command === "delete") rows.splice(at, 1);
      else {
        const next = EJSON.parse(p.document, { relaxed: false });
        if (canonical(rows[at]._id) !== canonical(next._id))
          throw new Error("The _id field cannot be changed.");
        rows[at] = next;
      }
      return;
    }
    case "createCollection":
      if (data[p.database]?.[p.collection])
        throw new Error("Collection already exists.");
      data[p.database] ??= Object.create(null);
      data[p.database][p.collection] = [];
      return;
    case "dropCollection":
      if (p.confirmation !== p.collection)
        throw new Error("Type the collection name to confirm.");
      delete data[p.database]?.[p.collection];
      return;
    case "workspace":
      return structuredClone(workspace);
    case "saveQuery": {
      const item = {
        id: p.id || crypto.randomUUID(),
        name: p.name,
        query: p.query,
        updatedAt: new Date().toISOString(),
      };
      workspace.saved = [
        item,
        ...workspace.saved.filter((s) => s.id !== item.id),
      ];
      persist();
      return item;
    }
    case "removeQuery":
      workspace.saved = workspace.saved.filter((s) => s.id !== p.id);
      persist();
      return;
    case "clearHistory":
      workspace.history = [];
      persist();
      return;
    default:
      throw new Error("Unsupported sample operation.");
  }
}
const pending = new Map<string, { connectionId: string; cancelled: boolean }>();
export const demoBridge: Bridge = {
  call: async (command, payload) => {
    if (command === "cancelQuery") {
      const p = payload as { requestId: string; connectionId: string };
      const query = pending.get(p.requestId);
      if (query?.connectionId === p.connectionId) query.cancelled = true;
      return undefined as any;
    }
    const query =
      command === "query" ||
      command === "explain" ||
      command === "previewStage" ||
      command === "countStage"
        ? (payload as Query)
        : undefined;
    const state = { connectionId: query?.connectionId ?? "", cancelled: false };
    if (query?.requestId) pending.set(query.requestId, state);
    try {
      await new Promise((r) => setTimeout(r, 90));
      if (state.cancelled) throw new Error("Query cancelled.");
      return dispatch(command, payload);
    } finally {
      if (query?.requestId) pending.delete(query.requestId);
    }
  },
};
