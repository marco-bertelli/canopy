import { it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../electron/store";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
it("serializes concurrent updates, persists atomically, and restricts file permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canopy-store-"));
  directories.push(directory);
  const secrets = {
    available: () => false,
    encrypt: () => "",
    decrypt: () => "",
  };
  const store = new Store(directory, secrets);
  await store.load();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      store.update((state) => {
        state.saved.push({
          id: String(i),
          name: `Query ${i}`,
          query: {} as any,
          updatedAt: "",
        });
      }),
    ),
  );
  expect(store.snapshot.saved).toHaveLength(20);
  const reloaded = new Store(directory, secrets);
  await reloaded.load();
  expect(reloaded.snapshot.saved).toHaveLength(20);
  expect((await stat(join(directory, "workspace.json"))).mode & 0o777).toBe(
    0o600,
  );
  const snapshot = reloaded.snapshot;
  snapshot.saved.length = 0;
  expect(reloaded.snapshot.saved).toHaveLength(20);
  expect(
    JSON.parse(await readFile(join(directory, "workspace.json"), "utf8")).saved,
  ).toHaveLength(20);
});
