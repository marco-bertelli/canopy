import { expect, it } from "vitest";
import { stageQuery, parseEJSON } from "../shared/json";
import {
  stageContext,
  StagePageCache,
  type StagePage,
} from "../src/lib/aggregation";
import { schemas } from "../shared/validation";
import type { Query } from "../shared/contracts";
const query: Query = {
  connectionId: "test",
  database: "db",
  collection: "rows",
  mode: "aggregate",
  filter: "{}",
  projection: "{}",
  sort: "{}",
  pipeline:
    '[{"$match":{"n":{"$numberLong":"9223372036854775806"}}},{"$group":{"_id":"$status","count":{"$sum":1}}},{"$limit":2}]',
  skip: 25,
  limit: 25,
};
it("builds complete prefixes, preserves BSON and excludes disabled stages in both scopes", () => {
  const input = stageQuery({ ...query, stage: 1, side: "input" });
  const output = stageQuery({ ...query, stage: 1, side: "output" });
  expect((parseEJSON(input.pipeline) as any[])[0].$match.n.toString()).toBe(
    "9223372036854775806",
  );
  expect(parseEJSON(input.pipeline)).toHaveLength(1);
  expect(parseEJSON(output.pipeline)).toHaveLength(2);
  expect(
    parseEJSON(stageQuery({ ...query, stage: 0, side: "input" }).pipeline),
  ).toEqual([]);
  expect(
    parseEJSON(
      stageQuery({ ...query, stage: 1, side: "output", pipelineDisabled: [1] })
        .pipeline,
    ),
  ).toHaveLength(1);
  expect(() => stageQuery({ ...query, stage: 3, side: "input" })).toThrow(
    /no longer exists/,
  );
  expect(() =>
    stageQuery({
      ...query,
      pipeline: '[{"$out":"other"}]',
      stage: 0,
      side: "input",
      pipelineDisabled: [0],
    }),
  ).toThrow(/write data/);
  expect(
    schemas.previewStage.safeParse({ ...query, stage: -1, side: "output" })
      .success,
  ).toBe(false);
});
it("invalidates only affected prefixes and reuses one stage’s output as the next input", () => {
  const first = stageContext(query, 0)!,
    second = stageContext(query, 1)!;
  expect(first.output.key).toBe(second.input.key);
  const later = {
    ...query,
    pipeline: query.pipeline.replace('"$limit":2', '"$limit":4'),
  };
  expect(stageContext(later, 1)?.output.key).toBe(second.output.key);
  const earlier = {
    ...query,
    pipeline: query.pipeline.replace(
      '"$numberLong":"9223372036854775806"',
      '"$numberLong":"1"',
    ),
  };
  expect(stageContext(earlier, 1)?.input.key).not.toBe(second.input.key);
  expect(stageContext({ ...query, pipelineDisabled: [1] }, 1)?.input.key).toBe(
    stageContext({ ...query, pipelineDisabled: [1] }, 1)?.output.key,
  );
  expect(stageContext({ ...query, pipeline: "[{ broken]" }, 0)).toBeUndefined();
});
it("bounds cached pages and keeps page sizes, offsets and collections separate", () => {
  const cache = new StagePageCache(1000, 2);
  const page = (scope: string, skip = 0): StagePage => ({
    scope,
    skip,
    limit: 25,
    at: 1,
    result: {
      documents: [{ n: 1 }],
      originals: ['{"n":1}'],
      hasMore: false,
      duration: 1,
      readOnly: true,
    },
  });
  cache.set(page("a"));
  cache.set(page("b"));
  expect(cache.get("a", 25, 0)).toBeDefined();
  cache.set(page("c"));
  expect(cache.get("b", 25, 0)).toBeUndefined();
  expect(cache.get("a", 50, 0)).toBeUndefined();
  expect(cache.get("a", 25, 25)).toBeUndefined();
  cache.set({
    ...page("huge"),
    result: { ...page("huge").result, originals: ["x".repeat(1000)] },
  });
  expect(cache.get("huge", 25, 0)).toBeUndefined();
});
