import type { Query, QueryResult, StageSide } from "../../shared/contracts";
export const sides: StageSide[] = ["input", "output"];
export interface StageScope {
  key: string;
  label: string;
}
export interface StageContext {
  index: number;
  operator: string;
  disabled: boolean;
  stages: { operator: string; disabled: boolean }[];
  input: StageScope;
  output: StageScope;
}
export function stageContext(
  query: Query,
  index: number,
): StageContext | undefined {
  try {
    const stages: unknown = JSON.parse(query.pipeline);
    if (!Array.isArray(stages) || stages.length > 100 || !stages[index]) return;
    if (
      stages.some(
        (s) =>
          !s ||
          typeof s !== "object" ||
          Array.isArray(s) ||
          Object.keys(s).length !== 1 ||
          !Object.keys(s)[0].startsWith("$"),
      )
    )
      return;
    const enabled = (i: number) => !query.pipelineDisabled?.includes(i);
    const scope = (end: number, label: string) => ({
      key: JSON.stringify([
        query.connectionId,
        query.database,
        query.collection,
        stages.slice(0, end).filter((_, i) => enabled(i)),
      ]),
      label,
    });
    let prior = index - 1;
    while (prior >= 0 && !enabled(prior)) prior--;
    const operator = Object.keys(stages[index])[0];
    return {
      index,
      operator,
      disabled: !enabled(index),
      stages: stages.map((s, i) => ({
        operator: Object.keys(s)[0],
        disabled: !enabled(i),
      })),
      input: scope(
        index,
        prior < 0
          ? "Collection documents"
          : `After stage ${prior + 1} · ${Object.keys(stages[prior])[0]}`,
      ),
      output: scope(
        index + 1,
        enabled(index)
          ? `After stage ${index + 1} · ${operator}`
          : "Stage bypassed · input passes through",
      ),
    };
  } catch {
    return;
  }
}
export interface StagePage {
  result: QueryResult;
  scope: string;
  limit: number;
  skip: number;
  at: number;
}
export const pageKey = (scope: string, limit: number, skip: number) =>
  `${scope}:${limit}:${skip}`;
/** Recent stage pages only; oversized current pages can be displayed without being retained. */
export class StagePageCache {
  private pages = new Map<string, { page: StagePage; bytes: number }>();
  private bytes = 0;
  constructor(
    private maxBytes = 8 * 1024 * 1024,
    private maxPages = 12,
  ) {}
  get(scope: string, limit: number, skip: number) {
    const key = pageKey(scope, limit, skip),
      entry = this.pages.get(key);
    if (!entry) return;
    this.pages.delete(key);
    this.pages.set(key, entry);
    return entry.page;
  }
  set(page: StagePage) {
    const key = pageKey(page.scope, page.limit, page.skip);
    const existing = this.pages.get(key);
    if (existing) {
      this.bytes -= existing.bytes;
      this.pages.delete(key);
    }
    const bytes = page.result.originals.reduce(
      (sum, text) => sum + text.length * 4,
      0,
    );
    if (bytes > this.maxBytes) return;
    this.pages.set(key, { page, bytes });
    this.bytes += bytes;
    while (this.bytes > this.maxBytes || this.pages.size > this.maxPages) {
      const oldest = this.pages.entries().next().value!;
      this.pages.delete(oldest[0]);
      this.bytes -= oldest[1].bytes;
    }
  }
}
export function exactCount(value: string) {
  try {
    return BigInt(value).toLocaleString("en");
  } catch {
    return value;
  }
}
