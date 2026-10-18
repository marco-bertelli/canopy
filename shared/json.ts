import type { StageRequest, Query } from "./contracts";
import { EJSON } from "bson";
export function parseEJSON(text: string): unknown {
  return EJSON.parse(text, { relaxed: false });
}
export function parseObject(
  text: string,
  label = "Query",
): Record<string, any> {
  let value: unknown;
  try {
    value = parseEJSON(text.trim() || "{}");
  } catch {
    throw new Error(
      `${label} must be valid JSON. Use Extended JSON for BSON values, e.g. {"_id":{"$oid":"…"}}.`,
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, any>;
}
export function canonical(value: unknown): string {
  return EJSON.stringify(value, { relaxed: false });
}
export function readable(value: unknown): string {
  return EJSON.stringify(value, undefined, 2, { relaxed: true });
}
export function transport(value: unknown): any {
  return JSON.parse(EJSON.stringify(value, { relaxed: false }));
}
export function pipeline(text: string): Record<string, any>[] {
  let value: unknown;
  try {
    value = parseEJSON(text);
  } catch {
    throw new Error("Pipeline must be a JSON array of stages.");
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (v) =>
        !v ||
        typeof v !== "object" ||
        Array.isArray(v) ||
        Object.keys(v).length !== 1 ||
        !Object.keys(v)[0].startsWith("$"),
    )
  )
    throw new Error(
      "Pipeline must contain at most 100 stages, with one $operator per stage.",
    );
  assertReadPipeline(value);
  return value;
}
export function assertReadPipeline(stages: Record<string, any>[]): void {
  for (const stage of stages) {
    if ("$out" in stage || "$merge" in stage)
      throw new Error(
        "$out and $merge write data. This workspace only runs read pipelines.",
      );
    if ("$lookup" in stage && Array.isArray(stage.$lookup?.pipeline))
      assertReadPipeline(stage.$lookup.pipeline);
    if ("$unionWith" in stage && Array.isArray(stage.$unionWith?.pipeline))
      assertReadPipeline(stage.$unionWith.pipeline);
    if ("$facet" in stage && stage.$facet && typeof stage.$facet === "object")
      for (const child of Object.values(stage.$facet))
        if (Array.isArray(child)) assertReadPipeline(child);
  }
}
export { csv } from "./csv";

/** Validate the whole draft, including disabled stages, before executing a prefix. */
export function enabledPipeline(text: string, disabled: number[] = []) {
  return pipeline(text).filter((_, index) => !disabled.includes(index));
}

/** Stage output runs the entire enabled prefix, never just the displayed input page. */
export function stageQuery(request: StageRequest): Query {
  const stages = pipeline(request.pipeline);
  if (request.stage >= stages.length)
    throw new Error(
      "This stage no longer exists. Select a stage in the pipeline.",
    );
  const prefix = stages
    .slice(0, request.stage + (request.side === "output" ? 1 : 0))
    .filter((_, i) => !request.pipelineDisabled?.includes(i));
  return {
    ...request,
    mode: "aggregate",
    pipeline: canonical(prefix),
    pipelineDisabled: [],
    filter: "{}",
    projection: "{}",
    sort: "{}",
  };
}
