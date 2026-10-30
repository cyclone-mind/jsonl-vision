import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { detectAgentSession } from "./agentSessionDetect";

function lines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\n/);
}

const claude = lines("ext-src/fixtures/claude-code-session.jsonl");
const codex = lines("ext-src/fixtures/codex-rollout.jsonl");
const events = lines("samples/events.jsonl");

describe("detectAgentSession", () => {
  it("recognizes a Claude Code session fixture and not a Codex rollout", () => {
    assert.equal(detectAgentSession(claude), "claude");
    assert.equal(detectAgentSession(codex), "codex");
    assert.notEqual(detectAgentSession(claude), "codex");
    assert.notEqual(detectAgentSession(codex), "claude");
  });

  it("does not treat ordinary JSONL or a chat-shaped object as a session", () => {
    assert.equal(detectAgentSession(events), null);
    assert.equal(
      detectAgentSession(['{"type":"user","message":{"role":"user","content":"hi"}}']),
      null
    );
    assert.equal(
      detectAgentSession([
        '{"timestamp":"2026-05-22T15:00:00.000Z","type":"event","payload":{"type":"click"}}',
      ]),
      null
    );
    assert.equal(detectAgentSession([""]), null);
    assert.equal(detectAgentSession([]), null);
  });

  it("accepts one strong record and ignores invalid lines ahead of it", () => {
    assert.equal(detectAgentSession([claude[0]]), "claude");
    assert.equal(detectAgentSession([codex[0]]), "codex");
    assert.equal(detectAgentSession(["not json", "", claude[2]]), "claude");
    assert.equal(detectAgentSession([codex[3]]), "codex");
  });

  it("does not treat a lone Codex message as a rollout without a stronger line", () => {
    assert.equal(detectAgentSession([codex[2]]), null);
    assert.equal(detectAgentSession([codex[2], codex[6]]), "codex");
  });

  it("classifies a truncated session_meta prefix without parsing the whole line", () => {
    const cut = codex[0].indexOf('"cli_version"');
    assert.ok(cut > 0);
    const head = codex[0].slice(0, cut);
    assert.match(head, /"type"\s*:\s*"session_meta"/);
    assert.match(head, /"cwd"\s*:/);
    assert.equal(head.endsWith("}"), false);
    assert.equal(detectAgentSession([head]), "codex");
    assert.equal(detectAgentSession(['{"type":"session_meta","payload":{"note":"no cwd"}}']), null);
  });

  it("stops after maxLines so a late marker is not enough on its own", () => {
    const padding = Array.from({ length: 5 }, () => '{"id":1}');
    assert.equal(detectAgentSession([...padding, claude[0]], { maxLines: 5 }), null);
    assert.equal(detectAgentSession([...padding, claude[0]], { maxLines: 6 }), "claude");
  });
});
