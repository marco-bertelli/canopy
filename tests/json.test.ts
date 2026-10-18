import { describe, it, expect } from "vitest";
import { ObjectId, Long, Decimal128, Binary, Int32 } from "bson";
import {
  canonical,
  csv,
  parseEJSON,
  parseObject,
  pipeline,
  enabledPipeline,
} from "../shared/json";
import { schemas } from "../shared/validation";
import { redact, summarizeSchema } from "../electron/mongo-service";
describe("BSON fidelity and query boundaries", () => {
  it("round trips BSON values without losing precision or type", () => {
    const value = {
      _id: new ObjectId(),
      large: Long.fromString("9223372036854775806"),
      price: Decimal128.fromString("100000000000000.00001"),
      created: new Date("2026-01-01"),
      int: new Int32(42),
      binary: new Binary(Buffer.from([0, 1, 255])),
    };
    const decoded: any = parseEJSON(canonical(value));
    expect(decoded.large.toString()).toBe("9223372036854775806");
    expect(decoded.price.toString()).toBe("100000000000000.00001");
    expect(decoded.int).toBeInstanceOf(Int32);
    expect(canonical(decoded)).toBe(canonical(value));
  });
  it("accepts native MongoDB query operators and rejects code and nonobjects", () => {
    expect(parseObject('{"age":{"$gte":18}}').age.$gte.valueOf()).toBe(18);
    for (const input of [
      "[]",
      "null",
      "db.users.find({})",
      "(() => process.exit())()",
    ])
      expect(() => parseObject(input)).toThrow();
  });
  it("blocks write pipelines, including nested pipelines", () => {
    for (const text of [
      '[{"$out":"other"}]',
      '[{"$merge":"other"}]',
      '[{"$facet":{"x":[{"$out":"other"}]}}]',
      '[{"$lookup":{"from":"x","pipeline":[{"$merge":"x"}]}}]',
      '[{"$unionWith":{"coll":"x","pipeline":[{"$out":"x"}]}}]',
    ])
      expect(() => pipeline(text)).toThrow(/write data/);
    expect(
      pipeline(
        '[{"$match":{}},{"$group":{"_id":"$status","count":{"$sum":1}}}]',
      ),
    ).toHaveLength(2);
    expect(() => pipeline('[{"$match":{},"$limit":2}]')).toThrow();
    expect(() => enabledPipeline('[{"$out":"other"}]', [0])).toThrow(
      /write data/,
    );
    expect(enabledPipeline('[{"$match":{}},{"$limit":2}]', [1])).toHaveLength(
      1,
    );
  });
  it("bounds page sizes and rejects unknown URI schemes", () => {
    expect(
      schemas.connect.safeParse({
        name: "x",
        uri: "https://example.com",
        color: "#000000",
        environment: "local",
        readOnly: true,
        remember: false,
      }).success,
    ).toBe(false);
    const q = {
      connectionId: "id",
      database: "db",
      collection: "col",
      mode: "find",
      filter: "{}",
      projection: "{}",
      sort: "{}",
      pipeline: "[]",
      skip: 0,
      limit: 0,
    };
    expect(schemas.query.safeParse(q).success).toBe(false);
    expect(schemas.query.safeParse({ ...q, limit: 500 }).success).toBe(true);
  });
  it("escapes CSV cells and neutralizes spreadsheet formulas", () => {
    expect(csv([{ a: 'x,"y"\n', b: "=SUM(A1:A9)" }])).toBe(
      '"a","b"\r\n"x,""y""\n","\'=SUM(A1:A9)"',
    );
  });
  it("redacts URI credentials from driver errors", () => {
    expect(
      redact("Failed mongodb+srv://alice:secret@host/db?password=secret"),
    ).not.toContain("secret");
    expect(redact("password=secret auth failed")).toBe(
      "password=[redacted] auth failed",
    );
  });
  it("labels sample coverage and nested fields", () => {
    const summary = summarizeSchema([
      { name: "one", profile: { age: new Int32(3) } },
      { name: null },
    ]);
    expect(summary.find((f) => f.path === "name")?.types).toEqual({
      string: 1,
      null: 1,
    });
    expect(summary.find((f) => f.path === "profile.age")).toMatchObject({
      present: 1,
      total: 2,
      types: { Int32: 1 },
    });
  });
});
