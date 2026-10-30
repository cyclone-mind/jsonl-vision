import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { editRecord, presentSessionLine } from "./agentSessionView";

function lines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\n/)
    .filter(line => line.trim() !== "");
}

const claude = lines("ext-src/fixtures/claude-code-session.jsonl");
const codex = lines("ext-src/fixtures/codex-rollout.jsonl");

function parsedDisplay(
  line: string,
  family: "claude" | "codex" | "generic",
  before: string[] = [],
  after: string[] = []
) {
  const view = presentSessionLine(line, family, { before, after });
  assert.ok(view);
  if (!view) throw new Error("missing view");
  return { view, display: JSON.parse(view.displayJson) as Record<string, unknown> };
}

describe("presentSessionLine", () => {
  it("labels a Claude user line and keeps the prompt", () => {
    const { view, display } = parsedDisplay(claude[0], "claude");
    assert.equal(view.role, "user");
    assert.match(view.summary, /^user · Fix the parser/);
    const body = display.user as { text: string };
    assert.match(body.text, /nested JSON strings/);
  });

  it("shows a Claude tool call with its name, object input, and paired JSON result", () => {
    const { view, display } = parsedDisplay(claude[2], "claude", [], [claude[3]]);
    assert.equal(view.role, "tool_call");
    assert.equal(view.toolName, "Read");
    assert.match(view.summary, /tool call · Read/);
    const body = display.tool_call as {
      name: string;
      input: { file_path: string };
      result: { language: string; lines: number };
    };
    assert.equal(body.name, "Read");
    assert.equal(body.input.file_path, "/Users/alice/myproject/src/parser.ts");
    assert.equal(body.result.language, "typescript");
    assert.equal(body.result.lines, 42);
  });

  it("parses a Claude tool-result JSON string and borrows the call's name and input", () => {
    const { view, display } = parsedDisplay(claude[3], "claude", [claude[2]]);
    assert.equal(view.role, "tool_result");
    assert.equal(view.toolName, "Read");
    const body = display.tool_result as {
      name: string;
      input: { file_path: string };
      output: { lines: number };
      is_error: boolean;
    };
    assert.equal(body.name, "Read");
    assert.equal(body.input.file_path, "/Users/alice/myproject/src/parser.ts");
    assert.equal(body.output.lines, 42);
    assert.equal(body.is_error, false);
  });

  it("parses a stringified Claude tool input into nodes", () => {
    const { display } = parsedDisplay(claude[4], "claude");
    const body = display.tool_call as { name: string; input: { command: string; timeout: number } };
    assert.equal(body.name, "Bash");
    assert.equal(body.input.command, "wc -l src/parser.ts");
    assert.equal(body.input.timeout, 10000);
  });

  it("shows a Codex shell call with arguments parsed and the paired output nested", () => {
    const { view, display } = parsedDisplay(codex[3], "codex", [], [codex[4]]);
    assert.equal(view.role, "tool_call");
    assert.equal(view.toolName, "shell");
    const body = display.tool_call as {
      name: string;
      input: { cmd: string; workdir: string };
      result: { exit_code: number; stdout: string };
    };
    assert.equal(body.name, "shell");
    assert.equal(body.input.cmd, "ls src");
    assert.equal(body.input.workdir, "/Users/alice/myproject");
    assert.equal(body.result.exit_code, 0);
    assert.match(body.result.stdout, /parser\.ts/);
  });

  it("hides Codex base instructions and keeps the session fields", () => {
    const { view, display } = parsedDisplay(codex[0], "codex");
    assert.equal(view.role, "meta");
    assert.match(view.summary, /session/);
    const body = display.meta as Record<string, unknown>;
    assert.equal(body.kind, "session");
    assert.equal(body.originator, "codex_cli_rs");
    assert.equal(body.cwd, "/Users/alice/myproject");
    assert.equal("base_instructions" in body, false);
    assert.equal(JSON.stringify(body).includes("You are Codex"), false);
  });

  it("expands a JSON string on a normal record when session mode is forced", () => {
    const { display } = parsedDisplay('{"id":1,"payload":"{\\"ok\\":true}"}', "generic");
    const body = display.record as { id: number; payload: { ok: boolean } };
    assert.equal(body.id, 1);
    assert.equal(body.payload.ok, true);
  });
});

describe("editRecord", () => {
  it("writes a nested edit back into a Codex arguments string", () => {
    const result = editRecord(codex[3], ["tool_call", "input", "cmd"], "pwd", {
      family: "codex",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as {
      type: string;
      payload: { name: string; call_id: string; arguments: string };
    };
    assert.equal(parsed.type, "response_item");
    assert.equal(parsed.payload.name, "shell");
    assert.equal(parsed.payload.call_id, "call_abc123");
    assert.equal(typeof parsed.payload.arguments, "string");
    assert.deepEqual(JSON.parse(parsed.payload.arguments), {
      cmd: "pwd",
      workdir: "/Users/alice/myproject",
      timeout_ms: 10000,
    });
  });

  it("writes a Claude tool-result field back into the content string", () => {
    const result = editRecord(claude[3], ["tool_result", "output", "lines"], 7, {
      family: "claude",
      before: [claude[2]],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as {
      uuid: string;
      message: { content: Array<{ content: string; tool_use_id: string }> };
    };
    assert.equal(parsed.uuid, "6ddac0a6-1111-4222-8333-000000000004");
    assert.equal(parsed.message.content[0].tool_use_id, "toolu_01ABC");
    assert.equal(typeof parsed.message.content[0].content, "string");
    assert.deepEqual(JSON.parse(parsed.message.content[0].content), {
      file_path: "/Users/alice/myproject/src/parser.ts",
      language: "typescript",
      lines: 7,
    });
  });

  it("updates a real object input without stringifying it", () => {
    const result = editRecord(
      claude[2],
      ["tool_call", "input", "file_path"],
      "/Users/alice/myproject/src/next.ts",
      { family: "claude" }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as {
      message: { content: Array<{ input: { file_path: string }; name: string }> };
    };
    assert.equal(parsed.message.content[0].name, "Read");
    assert.deepEqual(parsed.message.content[0].input, {
      file_path: "/Users/alice/myproject/src/next.ts",
    });
  });

  it("rejects edits of paired values, synthetic labels, and truncated previews", () => {
    const paired = editRecord(claude[3], ["tool_result", "name"], "Write", {
      family: "claude",
      before: [claude[2]],
    });
    assert.deepEqual(paired, { ok: false, reason: "readonly" });
    assert.equal(claude[3], lines("ext-src/fixtures/claude-code-session.jsonl")[3]);

    const kind = editRecord(codex[0], ["meta", "kind"], "other", { family: "codex" });
    assert.deepEqual(kind, { ok: false, reason: "synthetic" });

    const long = "x".repeat(13_000);
    const line = `{"type":"user","uuid":"u","sessionId":"s","message":{"role":"user","content":${JSON.stringify(long)}}}`;
    const truncated = editRecord(line, ["user", "text"], "short", { family: "claude" });
    assert.deepEqual(truncated, { ok: false, reason: "truncated" });
    assert.equal(JSON.parse(line).message.content, long);
  });

  it("does not unwrap JSON strings when agent session mode is off", () => {
    const line = codex[3];
    const result = editRecord(line, ["payload", "name"], "shell_command", null);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as { payload: { name: string; arguments: string } };
    assert.equal(parsed.payload.name, "shell_command");
    assert.equal(typeof parsed.payload.arguments, "string");
    assert.equal(parsed.payload.arguments, JSON.parse(line).payload.arguments);
  });

  it("round-trips an edit inside a generic JSON string without touching siblings", () => {
    const line = '{"id":1,"payload":"{\\"ok\\":true,\\"n\\":1}","note":"plain"}';
    const result = editRecord(line, ["record", "payload", "n"], 5, { family: "generic" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.text) as { id: number; payload: string; note: string };
    assert.equal(parsed.id, 1);
    assert.equal(parsed.note, "plain");
    assert.equal(typeof parsed.payload, "string");
    assert.deepEqual(JSON.parse(parsed.payload), { ok: true, n: 5 });
  });

  it("edits an own __proto__ key inside a JSON string without changing the prototype", () => {
    const line = '{"arguments":"{\\"__proto__\\":1,\\"a\\":2}"}';
    const result = editRecord(line, ["record", "arguments", "a"], 3, { family: "generic" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const args = JSON.parse(JSON.parse(result.text).arguments) as { a: number };
    assert.equal(args.a, 3);
    assert.equal(Object.getPrototypeOf(args), Object.prototype);
  });
});
