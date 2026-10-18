import { beforeAll, afterAll, it, expect } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Long, Int32, Decimal128 } from "mongodb";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../electron/store";
import { MongoService } from "../electron/mongo-service";
import { analyzeExplain, numeric } from "../src/lib/explain";
import { canonical, parseEJSON } from "../shared/json";
import type { Connection, Namespace, Query } from "../shared/contracts";
let mongo: MongoMemoryServer,
  admin: MongoClient,
  directory: string,
  service: MongoService,
  connection: Connection,
  ns: Namespace,
  query: Query;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "canopy-integration-"));
  mongo = await MongoMemoryServer.create({
    instance: { args: ["--setParameter", "enableTestCommands=1"] },
    binary: {
      version: "8.0.16",
      downloadDir: join(process.cwd(), ".local/mongodb-binaries"),
    },
  });
  admin = await new MongoClient(mongo.getUri(), {
    promoteLongs: false,
    promoteValues: false,
  }).connect();
  await admin
    .db("test")
    .collection("customers")
    .insertMany(
      Array.from({ length: 61 }, (_, i) => ({
        _id: new ObjectId(),
        name: `Customer ${i}`,
        status: i % 2 ? "active" : "inactive",
        rank: new Int32(i),
        big: Long.fromString("9223372036854775806"),
        price: Decimal128.fromString("999999999.12345"),
        created: new Date("2026-01-01"),
      })),
    );
  const store = new Store(directory, {
    available: () => false,
    encrypt: () => {
      throw new Error("no keyring");
    },
    decrypt: () => "",
  });
  await store.load();
  service = new MongoService(store);
  connection = await service.call("connect", {
    name: "Integration",
    uri: mongo.getUri(),
    color: "#65bc9a",
    environment: "local",
    readOnly: false,
    remember: false,
  });
  ns = {
    connectionId: connection.id,
    database: "test",
    collection: "customers",
  };
  query = {
    ...ns,
    mode: "find",
    filter: "{}",
    projection: "{}",
    sort: '{"rank":1}',
    pipeline: "[]",
    limit: 25,
    skip: 0,
  };
});
afterAll(async () => {
  await service?.close();
  await admin?.close();
  await mongo?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it("cancels a blocked server query and keeps the connection usable", async () => {
  const requestId = crypto.randomUUID();
  await admin.db("admin").command({
    configureFailPoint: "failCommand",
    mode: { times: 1 },
    data: {
      failCommands: ["find"],
      blockConnection: true,
      blockTimeMS: 5000,
      appName: "Canopy",
    },
  });
  const started = performance.now();
  const operation = service.call("query", { ...query, requestId }).then(
    () => "completed",
    (error) => error.message,
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await service.call("cancelQuery", {
      connectionId: "another-connection",
      requestId,
    });
    await service.call("cancelQuery", {
      connectionId: connection.id,
      requestId,
    });
    expect(await operation).toBe("Query cancelled.");
    expect(performance.now() - started).toBeLessThan(2000);
  } finally {
    await admin
      .db("admin")
      .command({ configureFailPoint: "failCommand", mode: "off" });
  }
  expect((await service.call("query", query)).documents).toHaveLength(25);
});
it("restores session-only connection metadata without exposing connection strings", async () => {
  const boot = await service.call("boot", undefined);
  expect(boot.activeConnections).toContain(connection.id);
  expect(boot.connections.find((c) => c.id === connection.id)?.saved).toBe(
    false,
  );
  expect(JSON.stringify(boot)).not.toContain(mongo.getUri());
});
it("lists authorized databases and collections; pages and filters native queries", async () => {
  expect(
    await service.call("databases", { connectionId: connection.id }),
  ).toContain("test");
  expect(
    await service.call("collections", {
      connectionId: connection.id,
      database: "test",
    }),
  ).toContainEqual({ name: "customers", type: "collection" });
  const first = await service.call("query", query);
  expect(first.documents).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  const last = await service.call("query", { ...query, skip: 50 });
  expect(last.documents).toHaveLength(11);
  expect(last.hasMore).toBe(false);
  const filtered = await service.call("query", {
    ...query,
    filter: '{"status":"active"}',
    limit: 100,
  });
  expect(filtered.documents).toHaveLength(30);
  const projection = await service.call("query", {
    ...query,
    projection: '{"name":1}',
  });
  expect(projection.readOnly).toBe(true);
  expect(projection.documents[0].status).toBeUndefined();
});
it("edits without losing BSON types and refuses stale overwrites or changed ids", async () => {
  const result = await service.call("query", query);
  const doc: any = parseEJSON(result.originals[0]);
  doc.name = "Renamed";
  await service.call("replace", {
    ...ns,
    original: result.originals[0],
    document: canonical(doc),
  });
  const stored = await admin
    .db("test")
    .collection("customers")
    .findOne({ _id: doc._id });
  expect(stored?.big.toString()).toBe("9223372036854775806");
  expect(stored?.rank).toBeInstanceOf(Int32);
  expect(stored?.price.toString()).toBe("999999999.12345");
  await expect(
    service.call("replace", {
      ...ns,
      original: result.originals[0],
      document: canonical(doc),
    }),
  ).rejects.toThrow(/changed/);
  await expect(
    service.call("delete", { ...ns, original: result.originals[0] }),
  ).rejects.toThrow(/changed/);
  await expect(
    service.call("replace", {
      ...ns,
      original: canonical(doc),
      document: canonical({ ...doc, _id: new ObjectId() }),
    }),
  ).rejects.toThrow(/_id/);
  await service.call("delete", { ...ns, original: canonical(doc) });
});
it("aggregates read-only, provides explain/schema, creates and drops indexes", async () => {
  const grouped = await service.call("query", {
    ...query,
    mode: "aggregate",
    pipeline: '[{"$group":{"_id":"$status","count":{"$sum":1}}}]',
  });
  expect(grouped.documents).toHaveLength(2);
  expect(grouped.readOnly).toBe(true);
  await expect(
    service.call("query", {
      ...query,
      mode: "aggregate",
      pipeline: '[{"$out":"oops"}]',
    }),
  ).rejects.toThrow(/write data/);
  expect(await service.call("explain", query)).toHaveProperty("queryPlanner");
  expect(
    (await service.call("schema", ns)).find((f) => f.path === "big")?.types,
  ).toEqual({ Long: 60 });
  await service.call("createIndex", {
    ...ns,
    keys: '{"status":1,"rank":-1}',
    name: "test_compound",
    unique: false,
  });
  expect(
    (await service.call("indexes", ns)).some((i) => i.name === "test_compound"),
  ).toBe(true);
  await service.call("dropIndex", { ...ns, name: "test_compound" });
  await expect(
    service.call("dropIndex", { ...ns, name: "_id_" }),
  ).rejects.toThrow(/cannot/);
});
it("enforces read-only mode for every mutating operation on the backend", async () => {
  const read = await service.call("connect", {
    name: "Read",
    uri: mongo.getUri(),
    color: "#65bc9a",
    environment: "production",
    readOnly: true,
    remember: false,
  });
  const ro = { ...ns, connectionId: read.id };
  const result = await service.call("query", {
    ...query,
    connectionId: read.id,
  });
  expect(result.readOnly).toBe(true);
  for (const [command, extra] of [
    ["insert", { documents: '{"x":1}' }],
    [
      "replace",
      { original: result.originals[0], document: result.originals[0] },
    ],
    ["delete", { original: result.originals[0] }],
    ["createCollection", {}],
    ["dropCollection", { confirmation: ns.collection }],
    ["createIndex", { keys: '{"name":1}', name: "", unique: false }],
    ["dropIndex", { name: "fake" }],
  ] as const)
    await expect(
      service.call(command, { ...ro, ...extra } as any),
    ).rejects.toThrow(/read-only/);
});
it("imports/inserts, manages collections, stores queries/history, and never persists session URIs", async () => {
  const fresh = { ...ns, collection: "fresh" };
  await service.call("createCollection", fresh);
  expect(
    await service.call("insert", {
      ...fresh,
      documents: '[{"name":"a"},{"name":"b"}]',
    }),
  ).toEqual({ count: 2 });
  await expect(
    service.call("dropCollection", { ...fresh, confirmation: "wrong" }),
  ).rejects.toThrow(/confirm/);
  await service.call("dropCollection", { ...fresh, confirmation: "fresh" });
  await service.call("saveQuery", {
    name: "Active",
    query: { ...query, filter: '{"status":"active"}' },
  });
  const workspace = await service.call("workspace", undefined);
  expect(workspace.saved).toHaveLength(1);
  expect(workspace.history.length).toBeGreaterThan(0);
  const disk = await readFile(join(directory, "workspace.json"), "utf8");
  expect(disk).not.toContain(mongo.getUri());
  await expect(
    service.call("connect", {
      name: "No vault",
      uri: mongo.getUri(),
      color: "#65bc9a",
      environment: "local",
      readOnly: true,
      remember: true,
    }),
  ).rejects.toThrow(/keyring/);
});

it("measures real find and aggregation plans with explicit scope and disabled stages", async () => {
  const before = (await service.call("workspace", undefined)).history.length;
  const planner = analyzeExplain(await service.call("explain", query));
  expect(planner.roots.length).toBeGreaterThan(0);
  expect(planner.measured).toBe(false);
  const measured = analyzeExplain(
    await service.call("explain", { ...query, verbosity: "executionStats" }),
  );
  expect(measured.returned).toBe(25);
  expect(measured.docs).toBeGreaterThanOrEqual(25);
  expect((await service.call("workspace", undefined)).history.length).toBe(
    before,
  );
  const aggregate: Query = {
    ...query,
    mode: "aggregate",
    pipeline: '[{"$match":{}},{"$limit":1},{"$count":"total"}]',
    pipelineDisabled: [1],
  };
  const counted = await service.call("query", aggregate);
  expect(numeric(counted.documents[0].total)).toBe(60);
  const aggregation = analyzeExplain(
    await service.call("explain", {
      ...aggregate,
      verbosity: "executionStats",
    }),
  );
  expect(aggregation.returned).toBe(1);
  expect(aggregation.docs).toBe(60);
  expect(
    aggregation.nodes.some((n) => n.kind.toUpperCase().includes("GROUP")),
  ).toBe(true);
});
it("cancels a blocked Explain command and permits another Explain", async () => {
  const requestId = crypto.randomUUID();
  await admin.db("admin").command({
    configureFailPoint: "failCommand",
    mode: { times: 1 },
    data: {
      failCommands: ["explain"],
      blockConnection: true,
      blockTimeMS: 5000,
      appName: "Canopy",
    },
  });
  const started = performance.now();
  const operation = service
    .call("explain", { ...query, requestId, verbosity: "executionStats" })
    .then(
      () => "completed",
      (error) => error.message,
    );
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await service.call("cancelQuery", {
      connectionId: connection.id,
      requestId,
    });
    expect(await operation).toBe("Query cancelled.");
    expect(performance.now() - started).toBeLessThan(2000);
  } finally {
    await admin
      .db("admin")
      .command({ configureFailPoint: "failCommand", mode: "off" });
  }
  expect(await service.call("explain", query)).toHaveProperty("queryPlanner");
});
it("shows both sides of a stage, counts full prefixes and keeps inspections out of history", async () => {
  const target = { ...ns, collection: "stage_checks" };
  await admin
    .db(target.database)
    .collection(target.collection)
    .insertMany(
      Array.from({ length: 80 }, (_, i) => ({
        n: i,
        active: i % 2 === 0,
        category: `group-${i % 3}`,
      })),
    );
  const draft: Query = {
    ...query,
    ...target,
    mode: "aggregate",
    pipeline:
      '[{"$match":{"active":true}},{"$group":{"_id":"$category","count":{"$sum":1}}},{"$sort":{"count":-1}}]',
    limit: 25,
    skip: 0,
  };
  const before = (await service.call("workspace", undefined)).history.length;
  const input = await service.call("previewStage", {
    ...draft,
    stage: 1,
    side: "input",
  });
  const output = await service.call("previewStage", {
    ...draft,
    stage: 1,
    side: "output",
  });
  expect(input.documents).toHaveLength(25);
  expect(input.hasMore).toBe(true);
  expect(output.documents).toHaveLength(3);
  expect(output.readOnly).toBe(true);
  expect(
    output.documents.reduce(
      (total, row) => total + Number(numeric(row.count)),
      0,
    ),
  ).toBe(40);
  expect(
    (
      await service.call("countStage", {
        ...draft,
        skip: 25,
        stage: 1,
        side: "input",
      })
    ).count,
  ).toBe("40");
  expect(
    (await service.call("countStage", { ...draft, stage: 1, side: "output" }))
      .count,
  ).toBe("3");
  const bypass = { ...draft, pipelineDisabled: [1] };
  expect(
    (await service.call("countStage", { ...bypass, stage: 1, side: "output" }))
      .count,
  ).toBe("40");
  expect(
    (
      await service.call("countStage", {
        ...draft,
        pipeline: '[{"$match":{"n":-1}}]',
        stage: 0,
        side: "output",
      })
    ).count,
  ).toBe("0");
  expect((await service.call("workspace", undefined)).history.length).toBe(
    before,
  );
});
it("cancels both stage inspection and exact counts through the connection-scoped registry", async () => {
  for (const command of ["previewStage", "countStage"] as const) {
    const requestId = crypto.randomUUID();
    await admin.db("admin").command({
      configureFailPoint: "failCommand",
      mode: { times: 1 },
      data: {
        failCommands: ["aggregate"],
        blockConnection: true,
        blockTimeMS: 5000,
        appName: "Canopy",
      },
    });
    const started = performance.now();
    const operation = service
      .call(command, {
        ...query,
        mode: "aggregate",
        pipeline: '[{"$match":{}}]',
        requestId,
        stage: 0,
        side: "output",
      })
      .then(
        () => "completed",
        (e) => e.message,
      );
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await service.call("cancelQuery", {
        connectionId: connection.id,
        requestId,
      });
      expect(await operation).toBe("Query cancelled.");
      expect(performance.now() - started).toBeLessThan(2000);
    } finally {
      await admin
        .db("admin")
        .command({ configureFailPoint: "failCommand", mode: "off" });
    }
  }
});
it("connects through an SSH tunnel and closes it on disconnect", async () => {
  // A stand-in ssh on PATH: forwards -L like OpenSSH, or fails like a rejected key.
  const bin = await mkdtemp(join(tmpdir(), "canopy-ssh-"));
  const pidFile = join(bin, "pid");
  await writeFile(
    join(bin, "ssh"),
    `#!${process.execPath}
const net = require("node:net"), fs = require("node:fs");
const args = process.argv.slice(2);
if (args.at(-1) === "denied") { console.error("Permission denied (publickey)."); process.exit(255); }
const [, lp, host, port] = args[args.indexOf("-L") + 1].match(/^127\\.0\\.0\\.1:(\\d+):(.+):(\\d+)$/);
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setTimeout(() => net.createServer((c) => c.pipe(net.connect(+port, host)).pipe(c)).listen(+lp, "127.0.0.1"), 300);
`,
    { mode: 0o755 },
  );
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const input = {
      name: "Tunnel",
      uri: mongo.getUri().replace("127.0.0.1", "localhost"),
      color: "#65bc9a",
      environment: "local" as const,
      readOnly: true,
      remember: false,
    };
    await expect(
      service.call("connect", { ...input, ssh: "denied" }),
    ).rejects.toThrow(/Permission denied \(publickey\)/);
    await expect(
      service.call("connect", { ...input, ssh: "-oProxyCommand=x" }),
    ).rejects.toThrow();
    const tunneled = await service.call("connect", {
      ...input,
      ssh: "bastion",
    });
    expect(tunneled.host).toMatch(/via bastion$/);
    expect(
      await service.call("databases", { connectionId: tunneled.id }),
    ).toContain("test");
    const pid = Number(await readFile(pidFile, "utf8"));
    await service.call("disconnect", { connectionId: tunneled.id });
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    process.env.PATH = path;
    await rm(bin, { recursive: true, force: true });
  }
});
