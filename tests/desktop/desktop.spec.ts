import { test, expect, _electron as electron } from "@playwright/test";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Long } from "mongodb";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("desktop UI, sandboxed bridge, and real MongoDB round trip", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canopy-desktop-"));
  const mongo = await MongoMemoryServer.create({
    binary: {
      version: "8.0.16",
      downloadDir: resolve(".local/mongodb-binaries"),
    },
  });
  const client = await new MongoClient(mongo.getUri()).connect();
  await client
    .db("desktop_test")
    .collection("notes")
    .insertOne({
      _id: new ObjectId(),
      title: "Real MongoDB document",
      precise: Long.fromString("9223372036854775806"),
    });
  const executablePath = process.env.CANOPY_EXECUTABLE;
  const app = await electron.launch({
    chromiumSandbox: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(executablePath ? [] : ["."]),
      "--disable-gpu",
      "--ozone-platform=x11",
    ],
    env: { ...process.env, CANOPY_DATA_DIR: directory, CANOPY_DEV_URL: "" },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("button", { name: "Connect a database", exact: true }),
    ).toBeVisible();
    const initialResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((resource) => resource.name),
    );
    expect(
      initialResources.some((name) =>
        /\/(editor|JsonEditor|demo|sample|bson|PipelineBuilder|ExplainPanel|StageComparison|explain-example)-/.test(
          name,
        ),
      ),
    ).toBe(false);
    await expect
      .poll(() => page.evaluate(() => typeof window.canopy?.call))
      .toBe("function");
    expect(
      await page.evaluate(() => ({
        require: typeof (window as any).require,
        process: typeof (window as any).process,
      })),
    ).toEqual({ require: "undefined", process: "undefined" });
    const preferences = await app.evaluate(({ BrowserWindow }) =>
      (
        BrowserWindow.getAllWindows()[0].webContents as any
      ).getLastWebPreferences(),
    );
    expect(preferences.sandbox).toBe(true);
    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    expect(await app.evaluate(() => process.argv)).not.toContain(
      "--no-sandbox",
    );
    await page
      .getByRole("button", { name: "Connect a database", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Connection name" })
      .fill("Isolated test MongoDB");
    await page
      .getByLabel("Connection string", { exact: true })
      .fill(mongo.getUri());
    const remember = page.getByRole("checkbox", {
      name: /Remember connection/,
    });
    if (await remember.isEnabled()) await remember.uncheck();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /desktop_test/ }).click();
    await page.getByRole("button", { name: "notes", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Real MongoDB document", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "9223372036854775806", exact: true }),
    ).toBeVisible();
    await page.getByRole("row", { name: "Document 1", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit document", exact: true })
      .click();
    const editor = page.getByRole("textbox", { name: "Edit document JSON" });
    await editor.fill(
      (await editor.innerText()).replace(
        "Real MongoDB document",
        "Edited from Canopy",
      ),
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Edited from Canopy", exact: true }),
    ).toBeVisible();
    expect(
      (await client.db("desktop_test").collection("notes").findOne({}))?.title,
    ).toBe("Edited from Canopy");
    await page.getByRole("row", { name: "Document 1", exact: true }).click();
    await app.evaluate(({ clipboard }) =>
      clipboard.writeText("canopy-clipboard-test"),
    );
    await page
      .getByRole("button", { name: "Copy document", exact: true })
      .click();
    await expect
      .poll(async () => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain("Edited from Canopy");
    await page
      .getByRole("button", { name: "Aggregation", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Stage value", exact: true })
      .fill('{"title":"Edited from Canopy"}');
    await page.getByRole("button", { name: "Run stage", exact: true }).click();
    const stageInput = page.getByRole("region", {
      name: "Stage 1 input",
      exact: true,
    });
    const stageOutput = page.getByRole("region", {
      name: "Stage 1 output",
      exact: true,
    });
    await expect(
      stageInput.getByRole("cell", { name: "Edited from Canopy", exact: true }),
    ).toBeVisible();
    await expect(
      stageOutput.getByRole("cell", {
        name: "Edited from Canopy",
        exact: true,
      }),
    ).toBeVisible();
    await stageInput
      .getByRole("button", { name: "Count all", exact: true })
      .click();
    await stageOutput
      .getByRole("button", { name: "Count all", exact: true })
      .click();
    await expect(stageInput.locator(".stage-total")).toContainText("1");
    await expect(stageOutput.locator(".stage-total")).toContainText("1");
    await page.screenshot({
      path: "docs/screenshots/aggregation-comparison-live.png",
    });
    await page
      .getByRole("checkbox", { name: "Enable stage 2", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Run pipeline", exact: true })
      .click();
    await expect(page.locator(".result-count")).toHaveText("1");
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: "Indexes", exact: true }).click();
    await expect(page.locator(".index-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Explain", exact: true }).click();
    await expect(page.locator(".plan-node").first()).toBeVisible();
    await expect(page.locator(".explain-metrics")).toContainText(
      "Not reported",
    );
    await page
      .getByRole("button", { name: "Run & measure", exact: true })
      .click();
    await expect(page.locator(".explain-controls")).toContainText(
      "EXECUTION STATS",
    );
    await expect(page.locator(".explain-metrics")).not.toContainText(
      "Not reported",
    );
    await expect(page.locator(".explain-example")).toHaveCount(0);
    await page.screenshot({ path: "docs/screenshots/explain-live.png" });

    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Explore sample workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "customers", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to my connections" }).click();
    await page.getByRole("button", { name: /desktop_test/ }).click();
    await page.getByRole("button", { name: "notes", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Edited from Canopy", exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /desktop_test/ }).click();
    await page.getByRole("button", { name: "notes", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Edited from Canopy", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/desktop-live.png" });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await client.close();
    await mongo.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
