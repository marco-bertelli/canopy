import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "customers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Document 1", exact: true }),
  ).toBeVisible();
});
test("browses sample collections, pages, inspects BSON, and changes result views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({ path: "docs/screenshots/workspace-light.png" });
  await page.getByRole("row", { name: "Document 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit document", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("row", { name: "Document 51", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Document view", exact: true })
    .click();
  await expect(page.locator(".document-card")).toHaveCount(14);
  await page.getByRole("button", { name: "JSON view", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Query results JSON" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "orders", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "orders", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("executes filters, saves/reopens queries, and shows useful errors", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", {
    name: "Query filter",
    exact: true,
  });
  await editor.fill('{"status":"active"}');
  await editor.press("Control+Enter");
  await expect(editor).toHaveText('{"status":"active"}');
  await expect(page.locator(".result-count")).toHaveText("50+");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Query name" })
    .fill("Active customers");
  await page.getByRole("button", { name: "Save query", exact: true }).click();
  await page.getByRole("button", { name: /Saved queries/ }).click();
  await expect(
    page.getByRole("heading", { name: "Active customers" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Query filter", exact: true })
    .fill("{ nope");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".inline-error")).toContainText("valid JSON");
});
test("inserts, edits, and deletes a document with explicit confirmation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Insert document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Insert document JSON" })
    .fill('{"name":"Canopy Test","status":"active"}');
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Insert document", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Query filter", exact: true })
    .fill('{"name":"Canopy Test"}');
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("1");
  await page.getByRole("row", { name: "Document 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit document", exact: true })
    .click();
  const edit = page.getByRole("textbox", { name: "Edit document JSON" });
  const text = await edit.innerText();
  await edit.fill(text.replace("Canopy Test", "Canopy Updated"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Query filter", exact: true })
    .fill('{"name":"Canopy Updated"}');
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("1");
  await page.getByRole("row", { name: "Document 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete this document?" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(page.locator(".result-count")).toHaveText("0");
});
test("runs aggregation, explores schema and indexes, and changes theme", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "JSON", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Aggregation pipeline" })
    .fill('[{"$group":{"_id":"$status","count":{"$sum":1}}}]');
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("2");
  await page.getByRole("button", { name: "Schema", exact: true }).click();
  await expect(page.locator(".schema-table")).toContainText(
    "preferences.newsletter",
  );
  await page.getByRole("button", { name: /^Indexes/ }).click();
  await expect(page.locator(".index-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Create index", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Index keys JSON" })
    .fill('{"country":1}');
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create index" })
    .click();
  await expect(page.locator(".index-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("textbox", { name: "Query filter" }).fill("{}");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("50+");
  await page.screenshot({ path: "docs/screenshots/workspace-dark.png" });
});
test("opens command palette with keyboard, filters collections, and fits a compact desktop", async ({
  page,
}) => {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Search commands and collections" })
    .fill("products");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "products", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Filter collections" })
    .fill("products");
  await expect(
    page.getByRole("button", { name: "orders", exact: true }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/workspace-compact.png" });
});
test("creates a database, imports and exports EJSON, and confirms collection removal", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New database / collection" }).click();
  await page.getByRole("textbox", { name: "Database name" }).fill("scratch");
  await page
    .getByRole("textbox", { name: "Collection name", exact: true })
    .fill("checks");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create collection" })
    .click();
  await expect(
    page.getByRole("heading", { name: "checks", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collection actions" }).click();
  await page.getByRole("button", { name: "Import JSON", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Insert document JSON" })
    .fill('[{"name":"First"},{"name":"Second"}]');
  await page.getByRole("button", { name: "Import documents" }).click();
  await expect(page.locator(".result-count")).toHaveText("2");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extended JSON (lossless)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("checks.ejson");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toHaveLength(2);
  expect(exported[0]._id).toHaveProperty("$oid");
  await page.getByRole("button", { name: "Collection actions" }).click();
  await page
    .getByRole("button", { name: "Drop collection", exact: true })
    .click();
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", { name: "Drop collection", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog").getByRole("textbox").fill("checks");
  await confirm.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "checks", exact: true }),
  ).not.toBeVisible();
});
