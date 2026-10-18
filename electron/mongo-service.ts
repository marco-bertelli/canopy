import {
  MongoClient,
  type Document,
  type Collection,
  type Sort,
} from "mongodb";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import type {
  Command,
  Connection,
  ConnectionInput,
  Namespace,
  Query,
  Requests,
  Responses,
  SchemaField,
} from "../shared/contracts";
import { schemas } from "../shared/validation";
import {
  canonical,
  parseEJSON,
  parseObject,
  enabledPipeline,
  stageQuery,
  transport,
} from "../shared/json";
import { Store } from "./store";
import { openTunnel, type Tunnel } from "./ssh-tunnel";

const maxTimeMS = 15000;
const maxBytes = 16 * 1024 * 1024;
interface Session {
  client: MongoClient;
  connection: Connection;
  tunnel?: Tunnel;
}
async function closeSession(s?: Pick<Session, "client" | "tunnel">) {
  await s?.client.close();
  s?.tunnel?.close();
}
export function redact(message: string): string {
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[connection string]")
    .replace(/(password|pwd)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 2000);
}
export function summarizeSchema(
  documents: Record<string, unknown>[],
): SchemaField[] {
  const fields = new Map<
    string,
    { types: Record<string, number>; present: number }
  >();
  function walk(doc: Record<string, unknown>, prefix = "", depth = 0) {
    if (depth > 8) return;
    for (const [key, value] of Object.entries(doc)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const type =
        value === null
          ? "null"
          : Array.isArray(value)
            ? "array"
            : typeof value === "object" && "_bsontype" in value
              ? String((value as any)._bsontype)
              : value instanceof Date
                ? "date"
                : typeof value;
      const field = fields.get(path) ?? { types: {}, present: 0 };
      field.present++;
      field.types[type] = (field.types[type] ?? 0) + 1;
      fields.set(path, field);
      if (type === "object")
        walk(value as Record<string, unknown>, path, depth + 1);
    }
  }
  documents.forEach((d) => walk(d));
  return [...fields.entries()]
    .map(([path, f]) => ({ path, ...f, total: documents.length }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
export class MongoService {
  private sessions = new Map<string, Session>();
  private queries = new Map<
    string,
    { connectionId: string; controller: AbortController }
  >();
  constructor(private store: Store) {}
  async call<K extends Command>(
    command: K,
    input: Requests[K],
  ): Promise<Responses[K]> {
    const p = schemas[command].parse(input);
    return (await this.dispatch(command, p)) as Responses[K];
  }
  private session(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Connect to this server first.");
    return s;
  }
  private collection(p: Namespace, write = false): Collection {
    const s = this.session(p.connectionId);
    if (write && s.connection.readOnly)
      throw new Error(
        "This connection is read-only. Reconnect with read-only mode disabled to make changes.",
      );
    return s.client.db(p.database).collection(p.collection);
  }
  private async connect(p: ConnectionInput) {
    const id = p.id ?? randomUUID();
    if (p.remember && !this.store.secrets.available())
      throw new Error(
        "A system keyring is required to remember connection strings. Uncheck “Remember connection” to connect for this session.",
      );
    const tunnel = p.ssh ? await openTunnel(p.ssh, p.uri) : undefined;
    const client = new MongoClient(tunnel?.uri ?? p.uri, {
      appName: "Canopy",
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      maxPoolSize: 5,
      maxIdleTimeMS: 60000,
      socketTimeoutMS: 20000,
      promoteLongs: false,
      promoteValues: false,
    });
    try {
      await client.connect();
      await client.db().command({ ping: 1, maxTimeMS: 8000 });
      const host = p.uri
        .slice(p.uri.indexOf("://") + 3)
        .split("/")[0]
        .split("@")
        .at(-1)
        ?.split("?")[0];
      const connection: Connection = {
        id,
        name: p.name,
        color: p.color,
        environment: p.environment,
        readOnly: p.readOnly,
        host: (host || "MongoDB cluster") + (p.ssh ? ` via ${p.ssh}` : ""),
        saved: p.remember,
        ssh: p.ssh,
      };
      await this.store.update((state) => {
        state.connections = state.connections.filter(
          (c) => c.metadata.id !== id,
        );
        if (p.remember)
          state.connections.push({
            metadata: connection,
            encryptedUri: this.store.secrets.encrypt(p.uri),
          });
      });
      const previous = this.sessions.get(id);
      this.sessions.set(id, { client, connection, tunnel });
      await closeSession(previous);
      return connection;
    } catch (e) {
      await closeSession({ client, tunnel });
      throw e;
    }
  }
  private findOptions(q: Query) {
    const projection = parseObject(q.projection, "Projection");
    const sortInput = parseObject(q.sort, "Sort");
    const sort: Record<string, 1 | -1> = {};
    for (const [key, v] of Object.entries(sortInput)) {
      if (Number(v) !== 1 && Number(v) !== -1)
        throw new Error(
          "Sort values must be 1 (ascending) or -1 (descending).",
        );
      sort[key] = Number(v) as 1 | -1;
    }
    // Projection values are flags, not document data. Convert BSON numeric wrappers.
    for (const [key, value] of Object.entries(projection))
      if (
        value &&
        typeof value === "object" &&
        ["Int32", "Double", "Long"].includes(value._bsontype)
      )
        projection[key] = Number(value);
    return { projection, sort: sort as Sort };
  }
  private async run(
    q: Query,
    operation:
      | "query"
      | "preview"
      | "count"
      | "queryPlanner"
      | "executionStats" = "query",
  ) {
    const controller = new AbortController();
    if (q.requestId) {
      if (this.queries.has(q.requestId))
        throw new Error("This query is already running.");
      this.queries.set(q.requestId, {
        connectionId: q.connectionId,
        controller,
      });
    }
    try {
      if (operation === "count") return await this.count(q, controller.signal);
      if (operation === "query" || operation === "preview")
        return await this.read(q, controller.signal, operation === "query");
      return await this.explain(q, operation, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Query cancelled.");
      throw error;
    } finally {
      if (q.requestId) this.queries.delete(q.requestId);
    }
  }
  private async explain(
    q: Query,
    verbosity: "queryPlanner" | "executionStats",
    signal: AbortSignal,
  ) {
    const col = this.collection(q);
    const cursor =
      q.mode === "aggregate"
        ? col.aggregate(enabledPipeline(q.pipeline, q.pipelineDisabled), {
            maxTimeMS,
            allowDiskUse: false,
            signal,
          })
        : col
            .find(parseObject(q.filter, "Filter"), {
              ...this.findOptions(q),
              maxTimeMS,
              signal,
            })
            .skip(q.skip)
            .limit(q.limit);
    try {
      return transport(await cursor.explain(verbosity));
    } finally {
      await cursor.close();
    }
  }
  private async count(q: Query, signal: AbortSignal) {
    const started = performance.now();
    const cursor = this.collection(q).aggregate(
      [...enabledPipeline(q.pipeline, q.pipelineDisabled), { $count: "count" }],
      { maxTimeMS, allowDiskUse: false, signal },
    );
    try {
      const row = await cursor.next();
      return {
        count: String(row?.count ?? 0),
        duration: Math.round(performance.now() - started),
      };
    } finally {
      await cursor.close();
    }
  }
  private async read(q: Query, signal: AbortSignal, recordHistory = true) {
    const started = performance.now();
    const col = this.collection(q);
    const options = this.findOptions(q);
    const cursor =
      q.mode === "find"
        ? col
            .find(parseObject(q.filter, "Filter"), {
              ...options,
              maxTimeMS,
              signal,
              batchSize: q.limit + 1,
            })
            .skip(q.skip)
            .limit(q.limit + 1)
        : col.aggregate(
            [
              ...enabledPipeline(q.pipeline, q.pipelineDisabled),
              { $skip: q.skip },
              { $limit: q.limit + 1 },
            ],
            {
              maxTimeMS,
              allowDiskUse: false,
              signal,
              batchSize: q.limit + 1,
            },
          );
    const documents: Document[] = [];
    const originals: string[] = [];
    let bytes = 0;
    let hasMore = false;
    try {
      for await (const doc of cursor) {
        if (documents.length === q.limit) {
          hasMore = true;
          break;
        }
        signal.throwIfAborted();
        const original = canonical(doc);
        bytes += Buffer.byteLength(original);
        if (bytes > maxBytes)
          throw new Error(
            "These results exceed the 16 MB display limit. Choose a smaller page size or use a projection to exclude large fields.",
          );
        documents.push(doc);
        originals.push(original);
      }
    } finally {
      await cursor.close();
    }
    const duration = Math.round(performance.now() - started);
    if (recordHistory)
      await this.store.update((state) => {
        state.history.unshift({
          id: randomUUID(),
          query: { ...q, requestId: undefined },
          createdAt: new Date().toISOString(),
          count: documents.length,
          duration,
        });
        state.history = state.history.slice(0, 100);
      });
    return {
      documents: originals.map((original) => JSON.parse(original)),
      originals,
      hasMore,
      duration,
      readOnly:
        this.session(q.connectionId).connection.readOnly ||
        q.mode === "aggregate" ||
        Object.keys(options.projection).length > 0,
    };
  }
  private original(text: string): Document {
    const doc = parseObject(text, "Original document");
    if (!Object.hasOwn(doc, "_id"))
      throw new Error("This result has no _id and cannot be edited.");
    return doc;
  }
  private async dispatch(command: Command, p: any): Promise<unknown> {
    switch (command) {
      case "copyText":
        throw new Error(
          "Clipboard access is handled by the desktop application.",
        );
      case "boot":
        return {
          connections: [
            ...new Map([
              ...this.store.snapshot.connections.map(
                (c) => [c.metadata.id, c.metadata] as const,
              ),
              ...[...this.sessions].map(
                ([id, session]) => [id, session.connection] as const,
              ),
            ]).values(),
          ],
          secureStorage: this.store.secrets.available(),
          activeConnections: [...this.sessions.keys()],
        };
      case "connect":
        return this.connect(p);
      case "reconnect": {
        const saved = this.store.snapshot.connections.find(
          (c) => c.metadata.id === p.connectionId,
        );
        if (!saved) throw new Error("Saved connection not found.");
        return this.connect({
          ...saved.metadata,
          uri: this.store.secrets.decrypt(saved.encryptedUri),
          remember: true,
        });
      }
      case "disconnect": {
        for (const running of this.queries.values())
          if (running.connectionId === p.connectionId)
            running.controller.abort();
        const s = this.sessions.get(p.connectionId);
        this.sessions.delete(p.connectionId);
        await closeSession(s);
        return;
      }
      case "forgetConnection": {
        await this.dispatch("disconnect", p);
        await this.store.update((state) => {
          state.connections = state.connections.filter(
            (c) => c.metadata.id !== p.connectionId,
          );
        });
        return;
      }
      case "databases": {
        const s = this.session(p.connectionId);
        try {
          return (
            await s.client
              .db()
              .admin()
              .listDatabases({ nameOnly: true, authorizedDatabases: true })
          ).databases
            .map((d) => d.name)
            .sort();
        } catch (e: any) {
          if (e.code === 13) return [s.client.db().databaseName];
          throw e;
        }
      }
      case "collections":
        return (
          await this.session(p.connectionId)
            .client.db(p.database)
            .listCollections(
              {},
              { nameOnly: true, authorizedCollections: true },
            )
            .toArray()
        )
          .map((c) => ({ name: c.name, type: c.type }))
          .sort((a, b) => a.name.localeCompare(b.name));
      case "query":
        return this.run(p);
      case "previewStage":
        return this.run(stageQuery(p), "preview");
      case "countStage":
        return this.run(stageQuery(p), "count");
      case "cancelQuery": {
        const running = this.queries.get(p.requestId);
        if (running && running.connectionId === p.connectionId)
          running.controller.abort();
        return;
      }
      case "explain":
        return this.run(p, p.verbosity ?? "queryPlanner");
      case "indexes":
        return (
          await this.collection(p).listIndexes({ maxTimeMS }).toArray()
        ).map((i) => ({
          name: i.name,
          key: Object.fromEntries(
            Object.entries(i.key).map(([k, v]) => [
              k,
              typeof v === "object" && v !== null ? Number(v) : v,
            ]),
          ),
          unique: i.unique,
          sparse: i.sparse,
          expireAfterSeconds:
            i.expireAfterSeconds === undefined
              ? undefined
              : Number(i.expireAfterSeconds),
        }));
      case "createIndex": {
        const keys = parseObject(p.keys, "Index keys");
        if (!Object.keys(keys).length)
          throw new Error("Add at least one index field.");
        for (const k of Object.keys(keys)) {
          const v = keys[k];
          if (Number(v) === 1 || Number(v) === -1) keys[k] = Number(v);
          else if (!["text", "hashed", "2dsphere", "2d"].includes(v))
            throw new Error(
              "Index values must be 1, -1, text, hashed, 2dsphere, or 2d.",
            );
        }
        return this.collection(p, true).createIndex(keys, {
          unique: p.unique,
          ...(p.name ? { name: p.name } : {}),
          maxTimeMS,
        });
      }
      case "dropIndex":
        if (p.name === "_id_")
          throw new Error("The _id index cannot be removed.");
        await this.collection(p, true).dropIndex(p.name, { maxTimeMS });
        return;
      case "schema": {
        const cursor = this.collection(p).find({}, { maxTimeMS }).limit(200);
        const sample: Document[] = [];
        let bytes = 0;
        try {
          for await (const doc of cursor) {
            bytes += Buffer.byteLength(canonical(doc));
            if (bytes > maxBytes) break;
            sample.push(doc);
          }
        } finally {
          await cursor.close();
        }
        return summarizeSchema(sample);
      }
      case "insert": {
        const raw = parseEJSON(p.documents);
        const docs = Array.isArray(raw) ? raw : [raw];
        if (
          !docs.length ||
          docs.length > 1000 ||
          docs.some(
            (d) =>
              !d ||
              typeof d !== "object" ||
              Array.isArray(d) ||
              Object.getPrototypeOf(d) !== Object.prototype,
          )
        )
          throw new Error(
            "Insert a JSON object or an array of 1–1,000 objects.",
          );
        const result = await this.collection(p, true).insertMany(
          docs as Document[],
          { ordered: true },
        );
        return { count: result.insertedCount };
      }
      case "replace": {
        const old = this.original(p.original);
        const doc = parseObject(p.document, "Document");
        if (canonical(doc._id) !== canonical(old._id))
          throw new Error("The _id field cannot be changed.");
        const result = await this.collection(p, true).replaceOne(
          { _id: old._id, $expr: { $eq: ["$$ROOT", { $literal: old }] } },
          doc,
        );
        if (Number(result.matchedCount) === 0)
          throw new Error(
            "This document changed or was deleted since you opened it. Refresh before editing again.",
          );
        return;
      }
      case "delete": {
        const old = this.original(p.original);
        const result = await this.collection(p, true).deleteOne({
          _id: old._id,
          $expr: { $eq: ["$$ROOT", { $literal: old }] },
        });
        if (Number(result.deletedCount) === 0)
          throw new Error(
            "This document changed or was deleted. Refresh before trying again.",
          );
        return;
      }
      case "createCollection":
        this.collection(p, true);
        await this.session(p.connectionId)
          .client.db(p.database)
          .createCollection(p.collection);
        return;
      case "dropCollection":
        if (p.confirmation !== p.collection)
          throw new Error("Type the collection name to confirm.");
        await this.collection(p, true).drop();
        return;
      case "workspace": {
        const { saved, history } = this.store.snapshot;
        return { saved, history };
      }
      case "saveQuery": {
        const item = {
          id: p.id ?? randomUUID(),
          name: p.name,
          query: p.query,
          updatedAt: new Date().toISOString(),
        };
        await this.store.update((state) => {
          state.saved = [
            item,
            ...state.saved.filter((q) => q.id !== item.id),
          ].slice(0, 200);
        });
        return item;
      }
      case "removeQuery":
        await this.store.update((state) => {
          state.saved = state.saved.filter((q) => q.id !== p.id);
        });
        return;
      case "clearHistory":
        await this.store.update((state) => {
          state.history = [];
        });
        return;
    }
  }
  async close() {
    for (const running of this.queries.values()) running.controller.abort();
    await Promise.all([...this.sessions.values()].map(closeSession));
    this.sessions.clear();
  }
}
