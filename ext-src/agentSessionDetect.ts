// Sniff whether a JSONL file is a Claude Code session or a Codex CLI rollout.
//
// Both tools append one JSON object per line and do not document the shape.
// The rules below follow public field notes:
// - Claude Code (~/.claude/projects/<project>/<session>.jsonl): a line has
//   `type` of user/assistant/summary/system/… plus `sessionId` / `uuid` /
//   `message`. See community format notes such as
//   https://github.com/BFriedland/clog/blob/main/docs/SOURCE_FORMATS.md
// - Codex CLI (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl): every line is
//   `{ timestamp, type, payload }`. `type: "session_meta"` carries `cwd`,
//   `originator`, and `cli_version`. Tool calls are
//   `response_item` / `function_call` with `call_id` and string `arguments`.
//   See the Codex rollout notes and openai/codex SessionMeta.
//
// Only the lines passed in are inspected (the host passes a bounded head).
// A long line is not fully parsed: the leading slice is matched as text so a
// multi-megabyte tool result at the top of a file cannot stall detection.

export type AgentFamily = "claude" | "codex";

export interface DetectOptions {
  /** How many leading lines to consider. Defaults to 40. */
  maxLines?: number;
  /** Lines longer than this are classified from a prefix instead of JSON.parse. */
  maxParseChars?: number;
}

const DEFAULT_MAX_LINES = 40;
const DEFAULT_MAX_PARSE_CHARS = 64_000;
const PREFIX_CHARS = 8_000;

const CLAUDE_TYPES = new Set([
  "user",
  "assistant",
  "summary",
  "system",
  "attachment",
  "progress",
  "file-history-snapshot",
  "queue-operation",
  "last-prompt",
  "ai-title",
  "mode",
  "permission-mode",
]);

const CODEX_ENVELOPE_TYPES = new Set([
  "session_meta",
  "response_item",
  "event_msg",
  "turn_context",
  "compacted",
  "token_usage_record",
]);

interface Score {
  claudeStrong: number;
  claudeWeak: number;
  codexStrong: number;
  codexWeak: number;
}

function blankScore(): Score {
  return { claudeStrong: 0, claudeWeak: 0, codexStrong: 0, codexWeak: 0 };
}

function addScore(total: Score, next: Score) {
  total.claudeStrong += next.claudeStrong;
  total.claudeWeak += next.claudeWeak;
  total.codexStrong += next.codexStrong;
  total.codexWeak += next.codexWeak;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(record: object, key: string): unknown {
  if (!Object.hasOwn(record, key)) return undefined;
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A Claude user/assistant line: message object plus a session field. */
function scoreClaudeRecord(record: Record<string, unknown>): Score {
  const score = blankScore();
  const type = own(record, "type");
  if (!isString(type) || !CLAUDE_TYPES.has(type)) return score;

  const sessionish =
    isString(own(record, "sessionId")) ||
    isString(own(record, "uuid")) ||
    isString(own(record, "parentUuid")) ||
    isString(own(record, "cwd")) ||
    typeof own(record, "isSidechain") === "boolean" ||
    isString(own(record, "version")) ||
    isString(own(record, "requestId"));

  if (type === "user" || type === "assistant") {
    const message = own(record, "message");
    if (!isRecord(message)) return score;
    const content = own(message, "content");
    const contentOk = isString(content) || Array.isArray(content);
    if (!contentOk || !sessionish) return score;
    score.claudeStrong += 1;
    return score;
  }

  if (type === "summary") {
    if (isString(own(record, "summary")) && isString(own(record, "leafUuid"))) {
      score.claudeStrong += 1;
    }
    return score;
  }

  if (sessionish || isString(own(record, "subtype"))) {
    score.claudeWeak += 1;
  }
  return score;
}

function scoreCodexRecord(record: Record<string, unknown>): Score {
  const score = blankScore();
  const type = own(record, "type");
  if (!isString(type) || !CODEX_ENVELOPE_TYPES.has(type)) return score;
  if (!isString(own(record, "timestamp"))) return score;
  const payload = own(record, "payload");
  if (!isRecord(payload)) return score;

  if (type === "session_meta") {
    const strong =
      isString(own(payload, "cwd")) ||
      isString(own(payload, "originator")) ||
      isString(own(payload, "cli_version")) ||
      (isString(own(payload, "id")) && isString(own(payload, "timestamp")));
    if (strong) score.codexStrong += 1;
    return score;
  }

  if (type === "response_item") {
    const inner = own(payload, "type");
    if (
      (inner === "function_call" || inner === "custom_tool_call") &&
      isString(own(payload, "call_id")) &&
      isString(own(payload, "name"))
    ) {
      score.codexStrong += 1;
      return score;
    }
    if (inner === "function_call_output" && isString(own(payload, "call_id"))) {
      score.codexStrong += 1;
      return score;
    }
    if (
      inner === "message" &&
      (own(payload, "role") === "user" ||
        own(payload, "role") === "assistant" ||
        own(payload, "role") === "developer") &&
      Array.isArray(own(payload, "content"))
    ) {
      score.codexWeak += 1;
      return score;
    }
    if (inner === "reasoning" || inner === "web_search_call") {
      score.codexWeak += 1;
    }
    return score;
  }

  if (type === "event_msg" && isString(own(payload, "type"))) {
    const inner = own(payload, "type");
    if (
      inner === "user_message" ||
      inner === "agent_message" ||
      inner === "exec_command_end" ||
      inner === "token_count" ||
      inner === "task_started" ||
      inner === "task_complete" ||
      inner === "turn_aborted"
    ) {
      score.codexWeak += 1;
    }
    return score;
  }

  if (
    type === "turn_context" &&
    (isString(own(payload, "cwd")) || isString(own(payload, "model")))
  ) {
    score.codexWeak += 1;
    return score;
  }

  if (type === "compacted" || type === "token_usage_record") {
    score.codexWeak += 1;
  }
  return score;
}

/** Prefix match for a line that is too large or truncated to parse. */
function scorePrefix(sample: string): Score {
  const score = blankScore();
  const head = sample.slice(0, PREFIX_CHARS);
  if (/"type"\s*:\s*"session_meta"/.test(head) && /"(originator|cli_version|cwd)"\s*:/.test(head)) {
    score.codexStrong += 1;
    return score;
  }
  if (
    /"type"\s*:\s*"function_call"/.test(head) &&
    /"call_id"\s*:/.test(head) &&
    /"name"\s*:/.test(head)
  ) {
    score.codexStrong += 1;
    return score;
  }
  if (
    /"type"\s*:\s*"function_call_output"/.test(head) &&
    /"call_id"\s*:/.test(head) &&
    /"timestamp"\s*:/.test(head)
  ) {
    score.codexStrong += 1;
    return score;
  }
  if (
    /"sessionId"\s*:/.test(head) &&
    /"type"\s*:\s*"(user|assistant)"/.test(head) &&
    /"message"\s*:/.test(head)
  ) {
    score.claudeStrong += 1;
    return score;
  }
  if (
    /"type"\s*:\s*"summary"/.test(head) &&
    /"leafUuid"\s*:/.test(head) &&
    /"summary"\s*:/.test(head)
  ) {
    score.claudeStrong += 1;
  }
  return score;
}

function scoreLine(line: string, maxParseChars: number): Score {
  const trimmed = line.trim();
  if (!trimmed) return blankScore();
  if (trimmed.length > maxParseChars) return scorePrefix(trimmed);
  try {
    const value: unknown = JSON.parse(trimmed);
    if (!isRecord(value)) return blankScore();
    const claude = scoreClaudeRecord(value);
    const codex = scoreCodexRecord(value);
    addScore(claude, codex);
    return claude;
  } catch {
    return scorePrefix(trimmed);
  }
}

function decide(score: Score): AgentFamily | null {
  const claude = score.claudeStrong > 0 || score.claudeWeak >= 2;
  const codex = score.codexStrong > 0 || score.codexWeak >= 2;
  if (codex && !claude) return "codex";
  if (claude && !codex) return "claude";
  if (!claude && !codex) return null;
  const codexWeight = score.codexStrong * 2 + score.codexWeak;
  const claudeWeight = score.claudeStrong * 2 + score.claudeWeak;
  if (codexWeight === claudeWeight) return score.codexStrong > 0 ? "codex" : "claude";
  return codexWeight > claudeWeight ? "codex" : "claude";
}

/**
 * Classify a bounded list of JSONL lines. Returns null for ordinary JSONL.
 * One strong Claude or Codex record is enough; two weak records of the same
 * family also match. A single generic `{ type, payload }` line does not.
 */
export function detectAgentSession(
  lines: readonly string[],
  options: DetectOptions = {}
): AgentFamily | null {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxParseChars = options.maxParseChars ?? DEFAULT_MAX_PARSE_CHARS;
  const score = blankScore();
  let seen = 0;
  for (const line of lines) {
    if (seen >= maxLines) break;
    if (!line.trim()) continue;
    seen += 1;
    addScore(score, scoreLine(line, maxParseChars));
  }
  return decide(score);
}
