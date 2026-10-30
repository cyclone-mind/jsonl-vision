import { spawnSync } from "node:child_process";

const fix = process.argv.includes("--fix");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm", ["-F", "jsoncrack-react", fix ? "lint:fix" : "lint"]);
run("eslint", fix ? ["--fix", "src", "ext-src"] : ["src", "ext-src"]);
run("prettier", fix ? ["--write", "src", "ext-src"] : ["--check", "src", "ext-src"]);
