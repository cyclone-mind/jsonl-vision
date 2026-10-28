import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

function collect(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, acc);
    else if (name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

const entryPoints = [...collect("ext-src"), ...collect("src")];
if (entryPoints.length === 0) {
  console.error("No unit tests found.");
  process.exit(1);
}

// Drop output from a previous branch so `node --test` cannot run stale bundles.
rmSync("build/test", { recursive: true, force: true });

await esbuild.build({
  entryPoints,
  bundle: true,
  outdir: "build/test",
  outbase: ".",
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
});

function collectJs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collectJs(path, acc);
    else if (name.endsWith(".test.js")) acc.push(path);
  }
  return acc;
}

const files = collectJs("build/test");
if (files.length === 0) {
  console.error("esbuild produced no test files.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
