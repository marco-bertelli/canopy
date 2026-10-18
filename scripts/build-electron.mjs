import { build } from "esbuild";
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.cjs",
  platform: "node",
  format: "cjs",
  bundle: true,
  external: ["electron", "mongodb", "bson"],
  sourcemap: true,
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  platform: "node",
  format: "cjs",
  bundle: true,
  external: ["electron"],
});
