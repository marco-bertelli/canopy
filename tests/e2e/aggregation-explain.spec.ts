import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("row", { name: "Document 1", exact: true }),
  ).toBeVisible();
});
test("compares both sides, retains stage samples and separates full pipeline output", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  const input = page.getByRole("region", {
    name: "Stage 1 input",
    exact: true,
  });
  const output = page.getByRole("region", {
    name: "Stage 1 output",
    exact: true,
  });
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill('{"status":"inactive"}');
  await page.getByRole("button", { name: "Run stage", exact: true }).click();
  await expect(input.locator(".stage-page-sample")).toContainText("50+");
  await expect(output.locator(".stage-page-sample")).toContainText("10");
  await input.getByRole("button", { name: "Count all", exact: true }).click();
  await output.getByRole("button", { name: "Count all", exact: true }).click();
  await expect(page.locator(".stage-count-flow")).toHaveText(
    /64.*10.*documents/,
  );
  await output.getByRole("button", { name: "JSON", exact: true }).click();
  await expect(
    output.getByRole("textbox", { name: "output stage JSON" }),
  ).toContainText("inactive");
  await expect(input.getByRole("table")).toBeVisible();
  await page
    .getByRole("button", { name: "Stage 2 $limit", exact: true })
    .click();
  const secondInput = page.getByRole("region", {
    name: "Stage 2 input",
    exact: true,
  });
  const secondOutput = page.getByRole("region", {
    name: "Stage 2 output",
    exact: true,
  });
  await expect(secondInput.locator(".stage-page-sample")).toContainText("10");
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill("3");
  await page.keyboard.press("F7");
  await expect(secondOutput.locator(".stage-page-sample")).toContainText("3");
  await page
    .getByRole("checkbox", { name: "Enable stage 2", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Run stage", exact: true }).click();
  await expect(secondOutput.locator(".stage-page-sample")).toContainText("10");
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "JSON", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Aggregation pipeline" }),
  ).not.toBeEditable();
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "Steps", exact: true })
    .click();
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click();
  await expect(page.locator(".result-count")).toHaveText("10");
  await expect(
    page.getByRole("region", { name: "Stage input and output", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Stage input / output", exact: true })
    .click();
  await expect(secondInput.locator(".stage-page-sample")).toContainText("10");
  await expect(secondOutput.locator(".stage-page-sample")).toContainText("10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Query name" })
    .fill("Disabled limit pipeline");
  await page.getByRole("button", { name: "Save query", exact: true }).click();
  await page.getByRole("button", { name: /Saved queries/ }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Enable stage 2", exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".result-count")).toHaveText("10");
});
test("pages independently, keeps totals exact, and labels outdated stage data", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  await page.getByLabel("Query page size").selectOption("25");
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill('{"status":"inactive"}');
  const input = page.getByRole("region", {
    name: "Stage 1 input",
    exact: true,
  });
  const output = page.getByRole("region", {
    name: "Stage 1 output",
    exact: true,
  });
  await page.getByRole("button", { name: "Run stage", exact: true }).click();
  await expect(input.locator(".stage-data-footer")).toContainText("1–25");
  await expect(output.locator(".stage-data-footer")).toContainText("1–10");
  await input.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(input.locator(".stage-data-footer")).toContainText("26–50");
  await expect(output.locator(".stage-data-footer")).toContainText("1–10");
  await input.getByRole("button", { name: "Count all", exact: true }).click();
  await expect(input.locator(".stage-total")).toContainText("64");
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill('{"status":"active"}');
  await expect(output.locator(".stage-stale")).toBeVisible();
  await expect(input.locator(".stage-stale")).toHaveCount(0);
  await output.getByRole("button", { name: "Run", exact: true }).click();
  await expect(output.locator(".stage-page-sample")).toContainText("25+");
  await output.getByRole("button", { name: "Count all", exact: true }).click();
  await expect(output.locator(".stage-total")).toContainText("54");
  await expect(output.locator(".stage-stale")).toHaveCount(0);
  await expect(input.locator(".stage-data-footer")).toContainText("26–50");
});
test("keeps input available when the selected stage fails and inspects BSON read-only", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Stage operator" })
    .fill("$notARealStage");
  await page.getByRole("button", { name: "Run stage", exact: true }).click();
  const input = page.getByRole("region", {
    name: "Stage 1 input",
    exact: true,
  });
  const output = page.getByRole("region", {
    name: "Stage 1 output",
    exact: true,
  });
  await expect(input.locator(".stage-page-sample")).toContainText("50+");
  await expect(output.getByRole("alert")).toBeVisible();
  await input.getByRole("row", { name: "Document 1", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    input.getByRole("row", { name: "Document 2", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await input.getByRole("row", { name: "Document 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Read-only stage snapshot",
  );
  await expect(page.getByRole("dialog")).toContainText("Sofia Chen");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("groups the complete input prefix and supports compact, dark and stacked layouts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  const mode = page.getByRole("group", { name: "Pipeline editor mode" });
  await mode.getByRole("button", { name: "JSON", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Aggregation pipeline" })
    .fill(
      '[{"$match":{"status":"active"}},{"$group":{"_id":"$country","customers":{"$sum":1}}},{"$sort":{"customers":-1}}]',
    );
  const text = await page
    .getByRole("textbox", { name: "Aggregation pipeline" })
    .innerText();
  await page
    .getByRole("textbox", { name: "Aggregation pipeline" })
    .press("Control+Enter");
  await expect(page.locator(".result-count")).toHaveText("8");
  await expect
    .poll(() =>
      page.getByRole("textbox", { name: "Aggregation pipeline" }).innerText(),
    )
    .toBe(text);
  await mode.getByRole("button", { name: "Steps", exact: true }).click();
  await page
    .getByRole("button", { name: "Stage 2 $group", exact: true })
    .click();
  await page.getByRole("button", { name: "Run stage", exact: true }).click();
  const input = page.getByRole("region", {
    name: "Stage 2 input",
    exact: true,
  });
  const output = page.getByRole("region", {
    name: "Stage 2 output",
    exact: true,
  });
  await expect(input.locator(".stage-page-sample")).toContainText("50+");
  await expect(output.locator(".stage-page-sample")).toContainText("8");
  await input.getByRole("button", { name: "Count all", exact: true }).click();
  await output.getByRole("button", { name: "Count all", exact: true }).click();
  await expect(page.locator(".stage-count-flow")).toHaveText(
    /54.*8.*documents/,
  );
  await page.screenshot({
    path: "docs/screenshots/aggregation-comparison-light.png",
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: "docs/screenshots/aggregation-comparison-dark.png",
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Collapse stage editor" }).click();
  await expect(input).toBeVisible();
  await expect(output).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/aggregation-comparison-compact.png",
  });
  await page
    .getByRole("button", { name: "Stack vertically", exact: true })
    .click();
  await expect(page.locator(".stage-comparison")).toHaveClass(/stacked/);
  await expect(input.locator(".stage-page-sample")).toContainText("50+");
  await expect(output.locator(".stage-page-sample")).toContainText("8");
  expect(errors).toEqual([]);
});
test("preserves invalid drafts and Extended JSON across representation changes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill('{"created":{"$gte":{"$date":"2026-01-01T00:00:00.000Z"}}}');
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "JSON", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Aggregation pipeline" }),
  ).toContainText("$date");
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "Steps", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Stage value", exact: true })
    .fill("{ broken");
  await expect(
    page.getByRole("button", { name: "Run stage", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Aggregation", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Aggregation pipeline" }),
  ).toContainText("broken");
  await page
    .getByRole("textbox", { name: "Aggregation pipeline" })
    .fill('[{"$count":"total"}]');
  await page
    .getByRole("group", { name: "Pipeline editor mode" })
    .getByRole("button", { name: "Steps", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Stage value", exact: true }),
  ).toHaveText('"total"');
});
test("explains visually with honest example labeling and selected-stage evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await expect(page.locator(".explain-example")).toContainText(
    "not your sample data",
  );
  await expect(page.locator(".plan-node")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Run & measure", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Query explain plan" }),
  ).toHaveCount(0);
  await page.locator(".plan-node").filter({ hasText: "COLLSCAN" }).click();
  await expect(
    page.getByRole("complementary", { name: "Selected plan stage" }),
  ).toContainText("Reads collection documents");
  await expect(page.locator(".explain-findings")).toContainText(
    "Read amplification",
  );
  await page.screenshot({ path: "docs/screenshots/explain-light.png" });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({ path: "docs/screenshots/explain-dark.png" });
  await page.locator(".explain-findings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/explain-checks.png" });
  await page.locator(".explain-heading").scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/explain-compact.png" });
  expect(errors).toEqual([]);
});
