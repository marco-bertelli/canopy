import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
test("measure 500 documents with 60 fields", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "customers", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/demo.ts";
    const { demoBridge } = await import(path);
    const ns = {
      connectionId: "demo",
      database: "sample_store",
      collection: "benchmark",
    };
    await demoBridge.call("createCollection", ns);
    const documents = Array.from({ length: 500 }, (_, row) =>
      Object.fromEntries(
        Array.from({ length: 60 }, (_, col) => [
          `field_${col}`,
          `row ${row} value ${col}`,
        ]),
      ),
    );
    await demoBridge.call("insert", {
      ...ns,
      documents: JSON.stringify(documents),
    });
  });
  await page.getByRole("button", { name: "Collection actions" }).click();
  await page
    .getByRole("button", { name: "Refresh collections", exact: true })
    .click();
  await page.getByRole("button", { name: "benchmark", exact: true }).click();
  await page.getByLabel("Query page size").selectOption("500");
  const started = performance.now();
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("500");
  const queryMs = performance.now() - started;
  const elements = await page.locator(".data-table td").count();
  const editor = page.getByRole("textbox", {
    name: "Query filter",
    exact: true,
  });
  const typingStart = performance.now();
  await editor.fill('{"field_0":"row 1 value 0"}');
  await expect(page.locator(".stale-label")).toBeVisible();
  const typingMs = performance.now() - typingStart;
  const metrics = {
    queryMs: Math.round(queryMs),
    typingMs: Math.round(typingMs),
    tableCells: elements,
  };
  expect(elements).toBeLessThan(4000);
  await page.locator(".data-table-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(
    page.getByRole("row", { name: "Document 500", exact: true }),
  ).toBeVisible();
  await mkdir("docs/performance", { recursive: true });
  await writeFile(
    `docs/performance/${process.env.CANOPY_BENCHMARK_LABEL || "current"}.json`,
    JSON.stringify(metrics, null, 2) + "\n",
  );
  console.log(JSON.stringify(metrics));
});
