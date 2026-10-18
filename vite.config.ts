import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import metadata from "./package.json";
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(metadata.version) },
  plugins: [react()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (
            id.includes("commonjsHelpers") ||
            id.includes("vite/preload-helper")
          )
            return "runtime";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "react";
          if (/\/node_modules\/(@codemirror|@uiw|@lezer)\//.test(id))
            return "editor";
          if (id.includes("/node_modules/mingo/")) return "sample";
          if (id.includes("/node_modules/bson/")) return "bson";
        },
      },
    },
  },
});
