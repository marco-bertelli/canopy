import { test, expect } from "@playwright/test";
test("virtualized rows remain keyboard accessible and headers sort on the server model", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "customers", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Query page size").selectOption("500");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("64");
  expect(
    await page.locator(".data-table tbody tr[aria-label]").count(),
  ).toBeLessThan(40);
  const first = page.getByRole("row", { name: "Document 1", exact: true });
  await first.focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("row", { name: "Document 64", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.getByRole("button", { name: "Sort by name", exact: true }).click();
  await expect(
    page.getByRole("columnheader").filter({
      has: page.getByRole("button", { name: "Sort by name", exact: true }),
    }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Query sort" })).toContainText(
    "name",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Query sort" })).toHaveText(
    "{}",
  );
});
test("can cancel a pending query and preserves the previous result page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".result-count")).toHaveText("50+");
  // Slow only the bridge promise in the demo module to make the cancel interaction deterministic.
  await page.evaluate(async () => {
    const path = "/src/demo.ts";
    const { demoBridge } = await import(path);
    const original = demoBridge.call;
    demoBridge.call = async (command: string, payload: unknown) => {
      if (command === "query") await new Promise((r) => setTimeout(r, 800));
      return original(command, payload);
    };
  });
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await page.getByRole("button", { name: "Stop query", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run query", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".result-count")).toHaveText("50+");
  await expect(
    page.getByRole("status").filter({ hasText: "Query cancelled" }),
  ).toBeVisible();
  await expect(page.locator(".inline-error")).toHaveCount(0);
});
test("deep and wide document trees mount children only when expanded", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".result-count")).toHaveText("50+");
  await page.getByRole("row", { name: "Document 1", exact: true }).click();
  const nested = page.locator(".inspector .value-tree").filter({
    has: page.locator(":scope > summary", { hasText: "preferences" }),
  });
  await expect(nested.locator(".tree-children")).toHaveCount(0);
  await nested.locator(":scope > summary").click();
  await expect(nested).toContainText("newsletter");
});
