import { expect, it } from "vitest";
import { analyzeExplain, numeric } from "../src/lib/explain";
import { examplePlan } from "../src/explain-example";
it("preserves classic flow, measured zeroes and evidence without summing stage times", () => {
  const model = analyzeExplain(examplePlan);
  expect(model.roots[0].kind).toBe("SORT");
  expect(model.roots[0].children[0].kind).toBe("COLLSCAN");
  expect(model.keys).toBe(0);
  expect(model.millis).toBe(18);
  expect(model.findings.map((f) => f.title)).toEqual([
    "Collection scan",
    "Explicit sort",
    "Read amplification",
  ]);
  expect(numeric({ $numberLong: "0" })).toBe(0);
  expect(numeric({ $numberLong: "9223372036854775807" })).toBeUndefined();
});
it("does not invent execution numbers for a planner-only SBE plan", () => {
  const model = analyzeExplain({
    queryPlanner: {
      winningPlan: {
        queryPlan: {
          stage: "FETCH",
          inputStage: { stage: "IXSCAN", indexName: "status_1" },
        },
        slotBasedPlan: { stages: "internal text" },
      },
    },
  });
  expect(model.measured).toBe(false);
  expect(model.docs).toBeUndefined();
  expect(model.nodes[0].index).toBe("status_1");
  expect(model.nodes[0].output).toBeUndefined();
});
it("matches SBE measurements by planNodeId rather than guessing stages by position", () => {
  const model = analyzeExplain({
    queryPlanner: {
      winningPlan: {
        queryPlan: {
          stage: "GROUP",
          planNodeId: 2,
          inputStage: { stage: "COLLSCAN", planNodeId: 1 },
        },
      },
    },
    executionStats: {
      nReturned: 2,
      totalDocsExamined: 100,
      executionStages: {
        stage: "project",
        planNodeId: 2,
        nReturned: 2,
        inputStage: {
          stage: "group",
          planNodeId: 2,
          inputStage: { stage: "scan", planNodeId: 1, nReturned: 100 },
        },
      },
    },
  });
  expect(model.roots[0].kind).toBe("GROUP");
  expect(model.roots[0].output).toBe(2);
  expect(model.roots[0].children[0].output).toBe(100);
  expect(model.findings.some((f) => f.title === "Read amplification")).toBe(
    false,
  );
});
it("separates cursor work from aggregation output; retains reported spills", () => {
  const model = analyzeExplain({
    stages: [
      {
        $cursor: {
          queryPlanner: { winningPlan: { stage: "COLLSCAN" } },
          executionStats: {
            nReturned: { $numberLong: "100" },
            totalDocsExamined: { $numberLong: "100" },
            totalKeysExamined: 0,
            executionTimeMillis: 3,
          },
        },
      },
      {
        $group: { _id: "$status" },
        nReturned: { $numberLong: "2" },
        executionTimeMillisEstimate: 7,
        usedDisk: true,
      },
    ],
  });
  expect(model.scope).toBe("cursor");
  expect(model.returned).toBe(2);
  expect(model.millis).toBe(3);
  expect(model.findings.some((f) => f.title === "Read amplification")).toBe(
    false,
  );
  expect(model.findings.some((f) => f.title === "Disk work reported")).toBe(
    true,
  );
});
it("keeps shard branches separate and never invents cross-shard totals", () => {
  const block = {
    queryPlanner: { winningPlan: { stage: "IXSCAN", indexName: "_id_" } },
  };
  const model = analyzeExplain({ shards: { east: block, west: block } });
  expect(model.roots.map((n) => n.kind)).toEqual(["east", "west"]);
  expect(model.docs).toBeUndefined();
  expect(analyzeExplain({ unfamiliarPlan: true }).roots).toEqual([]);
});
