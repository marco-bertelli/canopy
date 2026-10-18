import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Connection, Workspace } from "../shared/contracts";
export interface StoredConnection {
  metadata: Connection;
  encryptedUri: string;
}
export interface DiskState extends Workspace {
  connections: StoredConnection[];
}
export interface SecretStore {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private directory: string,
    readonly secrets: SecretStore,
  ) {}
  private state: DiskState = { connections: [], saved: [], history: [] };
  async load() {
    try {
      const data = JSON.parse(
        await readFile(join(this.directory, "workspace.json"), "utf8"),
      );
      if (
        !Array.isArray(data.connections) ||
        !Array.isArray(data.saved) ||
        !Array.isArray(data.history)
      )
        throw new Error("Invalid workspace");
      this.state = data;
    } catch (e: any) {
      if (e.code !== "ENOENT")
        throw new Error(
          "The local workspace file could not be read. Restore workspace.json from a backup before continuing.",
        );
    }
  }
  get snapshot(): DiskState {
    return structuredClone(this.state);
  }
  async update(fn: (state: DiskState) => void) {
    const task = this.queue.then(async () => {
      const next = structuredClone(this.state);
      fn(next);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const file = join(this.directory, "workspace.json");
      const temp = join(this.directory, `.workspace-${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(temp, file);
      this.state = next;
    });
    this.queue = task.catch(() => {});
    await task;
  }
}
