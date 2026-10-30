import react from "@vitejs/plugin-react";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The webview imports jsoncrack-react from its built dist. Build that package
// once per process before Vite bundles the extension.
if (!process.env.JSONL_VISION_SKIP_GRAPH_BUILD) {
  const graph = spawnSync("pnpm", ["-F", "jsoncrack-react", "run", "build"], {
    stdio: "inherit",
    env: { ...process.env, JSONL_VISION_SKIP_GRAPH_BUILD: "1" },
  });
  if (graph.status !== 0) {
    process.exit(graph.status ?? 1);
  }
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "build/webview",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/index.tsx",
      output: {
        entryFileNames: "index.js",
        assetFileNames: "index[extname]",
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
});
