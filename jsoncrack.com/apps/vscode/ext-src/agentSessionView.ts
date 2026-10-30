// Readable projection of one Claude Code or Codex CLI JSONL record.
//
// The graph is not the raw line. It is a small object keyed by role
// (`user`, `assistant`, `tool_call`, `tool_result`, `meta`) with the tool
// name, inputs, and — when the matching line is nearby — the paired result.
// String fields that contain a JSON object or array are expanded into nodes.
//
// Edits address that display, then write back into the original line:
// - a normal scalar is replaced in place
// - a scalar inside an expanded string is written, and that string is
//   JSON.stringified back into the same field
// - values copied from another line, synthetic labels, and truncated
//   previews have no write and are rejected
//
// Fields left out of the projection (token usage, base instructions, ancestry
// ids, …) stay in the file and are unchanged by an edit.
import type { AgentFamily } from "./agentSessionDetect";
import type { PathSegment, Scalar } from "./applyEdit";
import { applyScalarEdit, applyWalkEdit, isJsonScalar, type WalkStep } from "./applyEdit";

export type { AgentFamily } from "./agentSessionDetect";

export type SessionRole = "user" | "assistant" | "tool_call" | "tool_result" | "meta" | "record";

export type LockReason = "paired" | "truncated" | "synthetic";

export interface SessionLock {
  path: PathSegment[];
  reason: LockReason;
}

export interface SessionNeighbors {
  /** Previous non-empty lines, nearest first. */
  before?: readonly string[];
  /** Following non-empty lines, nearest first. */
  after?: readonly string[];
}

export interface SessionPresentation {
  role: SessionRole;
  roleLabel: string;
  /** `tool call · Read` or `user · first words`. */
  summary: string;
  /** Short tab suffix, without the line number. */
  tabHint: string;
  toolName?: string;
  displayJson: string;
  locks: SessionLock[];
  writes: Map<string, WalkStep[]>;
}

export interface SessionEditContext {
  family: AgentFamily | "generic";
  before?: readonly string[];
  after?: readonly string[];
}

export type SessionEditFailure =
  | "invalid-json"
  | "bad-path"
  | "bad-value"
  | "readonly"
  | "truncated"
  | "synthetic";

export type SessionEditResult =
  | { ok: true; text: string }
  | { ok: false; reason: SessionEditFailure };

const ROLE_LABEL: Record<SessionRole, string> = {
  user: "user",
  assistant: "assistant",
  tool_call: "tool call",
  tool_result: "tool result",
  meta: "meta",
  record: "record",
};

/** Do not expand a string longer than this into nodes. */
const MAX_EXPAND_CHARS = 80_000;
/** Containers (objects and arrays) allowed inside one expanded string. */
const MAX_EXPAND_CONTAINERS = 150;
const MAX_EXPANSIONS = 32;
const MAX_EXPAND_DEPTH = 6;
/** Longer prose is previewed and cannot be written back from the preview. */
const MAX_DISPLAY_STRING = 12_000;
const MAX_NEIGHBOR_CHARS = 64_000;
/** Paired payloads larger than this stay a note instead of a second copy. */
const MAX_INLINE_PAIR_CHARS = 24_000;

const NOT_OWN = Symbol("not-own");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(record: object, key: string): unknown {
  if (!Object.hasOwn(record, key)) return undefined;
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function ownString(record: object, key: string): string | undefined {
  const value = own(record, key);
  return typeof value === "string" ? value : undefined;
}

function pathKey(path: readonly PathSegment[]): string {
  return JSON.stringify(path);
}

function isPrefix(prefix: readonly PathSegment[], path: readonly PathSegment[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((segment, index) => segment === path[index]);
}

function firstWords(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

function formatToolNames(names: string[]): string {
  const clean = names.map(name => name.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= 2) return clean.join(", ");
  return `${clean.slice(0, 2).join(", ")} +${clean.length - 2}`;
}

function containerCount(value: unknown, limit: number): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") continue;
    count += 1;
    if (count > limit) return count;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else {
      for (const key of Object.keys(current as object)) {
        stack.push(Object.getOwnPropertyDescriptor(current, key)?.value);
      }
    }
  }
  return count;
}

function parseJsonContainer(text: string): object | null {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > MAX_EXPAND_CHARS) return null;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object") return null;
    if (containerCount(parsed, MAX_EXPAND_CONTAINERS) > MAX_EXPAND_CONTAINERS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readChild(cursor: object, key: PathSegment): unknown {
  if (Array.isArray(cursor)) {
    if (typeof key !== "number" || !Object.hasOwn(cursor, key)) return NOT_OWN;
    return Object.getOwnPropertyDescriptor(cursor, key)?.value;
  }
  const name = typeof key === "number" ? String(key) : key;
  if (!Object.hasOwn(cursor, name)) return NOT_OWN;
  return Object.getOwnPropertyDescriptor(cursor, name)?.value;
}

class Projector {
  readonly writes = new Map<string, WalkStep[]>();
  readonly locks: SessionLock[] = [];
  private expansions = 0;
  private depth = 0;

  lock(path: PathSegment[], reason: LockReason) {
    this.locks.push({ path: [...path], reason });
  }

  register(path: PathSegment[], walk: WalkStep[], allowEmpty = false) {
    if (this.lockedReason(path)) return;
    if (walk.length === 0 && !allowEmpty) return;
    this.writes.set(
      pathKey(path),
      walk.map(step => ({ key: step.key, parseString: step.parseString }))
    );
  }

  lockedReason(path: readonly PathSegment[]): LockReason | null {
    const hits = this.locks.filter(lock => isPrefix(lock.path, path));
    if (hits.length === 0) return null;
    if (hits.some(hit => hit.reason === "truncated")) return "truncated";
    if (hits.some(hit => hit.reason === "synthetic")) return "synthetic";
    return "paired";
  }

  /** Project `parent[sourceKey]` onto `displayPath`, expanding JSON strings. */
  take(
    parent: object,
    sourceKey: PathSegment,
    displayPath: PathSegment[],
    walkToParent: readonly WalkStep[],
    readonly: boolean
  ): unknown {
    const child = readChild(parent, sourceKey);
    if (child === NOT_OWN) return undefined;
    const step: WalkStep = { key: sourceKey, parseString: false };
    const walk = [...walkToParent, step];
    if (typeof child === "string") {
      const parsed = this.beginExpand(child);
      if (parsed) {
        step.parseString = true;
        try {
          return this.projectValue(parsed, walk, displayPath, readonly);
        } finally {
          this.depth -= 1;
        }
      }
      if (child.length > MAX_DISPLAY_STRING) {
        this.lock(displayPath, "truncated");
        return `${child.slice(0, MAX_DISPLAY_STRING)}…`;
      }
    }
    return this.projectValue(child, walk, displayPath, readonly);
  }

  /** A value copied from another line, or a label that is not stored here. */
  showLocked(value: unknown, displayPath: PathSegment[], reason: LockReason): unknown {
    this.lock(displayPath, reason);
    if (typeof value === "string") {
      const parsed = parseJsonContainer(value);
      if (parsed && value.length <= MAX_INLINE_PAIR_CHARS)
        return this.projectValue(parsed, [], displayPath, true);
      if (value.length > MAX_DISPLAY_STRING) return `${value.slice(0, MAX_DISPLAY_STRING)}…`;
      return value;
    }
    if (value !== null && typeof value === "object") {
      const encoded = JSON.stringify(value);
      if (encoded.length > MAX_INLINE_PAIR_CHARS || containerCount(value, 80) > 80) {
        return "(paired value is too large to inline)";
      }
    }
    return this.projectValue(value, [], displayPath, true);
  }

  private beginExpand(text: string): object | null {
    if (this.depth >= MAX_EXPAND_DEPTH || this.expansions >= MAX_EXPANSIONS) return null;
    const parsed = parseJsonContainer(text);
    if (!parsed) return null;
    this.expansions += 1;
    this.depth += 1;
    return parsed;
  }

  private projectValue(
    value: unknown,
    walk: WalkStep[],
    displayPath: PathSegment[],
    readonly: boolean
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.take(value, index, [...displayPath, index], walk, readonly)
      );
    }
    if (isRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        const child = this.take(value, key, [...displayPath, key], walk, readonly);
        if (child !== undefined) out[key] = child;
      }
      return out;
    }
    if (!readonly && isJsonScalar(value)) this.register(displayPath, walk);
    return value;
  }
}

function summarize(
  role: SessionRole,
  options: { toolName?: string; text?: string; kind?: string }
): Pick<SessionPresentation, "roleLabel" | "summary" | "tabHint" | "toolName"> {
  const roleLabel = ROLE_LABEL[role];
  const toolName = options.toolName?.trim() || undefined;
  const words = options.text ? firstWords(options.text) : "";
  const detail =
    role === "tool_call" || role === "tool_result"
      ? toolName || words
      : role === "meta"
        ? options.kind || words
        : words || toolName || "";
  const summary = detail ? `${roleLabel} · ${detail}` : roleLabel;
  const tabHint =
    toolName ||
    (role === "meta" && options.kind ? options.kind : "") ||
    firstWords(words, 28) ||
    roleLabel;
  return { roleLabel, summary, tabHint, toolName };
}

function finish(
  projector: Projector,
  role: SessionRole,
  body: Record<string, unknown>,
  bits: { toolName?: string; text?: string; kind?: string }
): SessionPresentation {
  const displayJson = JSON.stringify({ [role]: body });
  return {
    role,
    ...summarize(role, bits),
    displayJson,
    locks: projector.locks,
    writes: projector.writes,
  };
}

function stampKind(projector: Projector, body: Record<string, unknown>, kind: string) {
  body.kind = kind;
  projector.lock(["meta", "kind"], "synthetic");
}

function addTimestamp(
  projector: Projector,
  body: Record<string, unknown>,
  record: Record<string, unknown>,
  displayPrefix: PathSegment[]
) {
  const timestamp = ownString(record, "timestamp");
  if (!timestamp || timestamp.length > 80) return;
  const path = [...displayPrefix, "timestamp"];
  body.timestamp = timestamp;
  projector.register(path, [{ key: "timestamp", parseString: false }]);
}

interface ClaudeBlock {
  kind: "text" | "thinking" | "tool_use" | "tool_result";
  index: number;
  text?: string;
  id?: string;
  name?: string;
  isError?: boolean;
}

function claudeBlocks(content: unknown): ClaudeBlock[] {
  if (!Array.isArray(content)) return [];
  const blocks: ClaudeBlock[] = [];
  content.forEach((block, index) => {
    if (!isRecord(block)) return;
    const type = ownString(block, "type");
    if (type === "text" && typeof own(block, "text") === "string") {
      blocks.push({ kind: "text", index, text: own(block, "text") as string });
    } else if (type === "thinking" && typeof own(block, "thinking") === "string") {
      blocks.push({ kind: "thinking", index, text: own(block, "thinking") as string });
    } else if (type === "tool_use") {
      blocks.push({
        kind: "tool_use",
        index,
        id: ownString(block, "id") ?? "",
        name: ownString(block, "name") ?? "tool",
      });
    } else if (type === "tool_result") {
      const isError = own(block, "is_error");
      blocks.push({
        kind: "tool_result",
        index,
        id: ownString(block, "tool_use_id") ?? "",
        name: "tool",
        ...(typeof isError === "boolean" ? { isError } : {}),
      });
    }
  });
  return blocks;
}

function messageContent(record: Record<string, unknown>): unknown {
  const message = own(record, "message");
  if (!isRecord(message)) return undefined;
  return own(message, "content");
}

function findClaudeToolUse(
  lines: readonly string[],
  id: string
): { name: string; input: unknown } | null {
  if (!id) return null;
  for (const line of lines) {
    if (!line.includes(id) || line.length > MAX_NEIGHBOR_CHARS) continue;
    const record = parseLine(line);
    if (!record) continue;
    const block = findBlock(messageContent(record), "tool_use", "id", id);
    if (!block) continue;
    return { name: ownString(block, "name") ?? "tool", input: own(block, "input") };
  }
  return null;
}

function findClaudeToolResult(
  lines: readonly string[],
  id: string
): { content: unknown } | "too-large" | null {
  if (!id) return null;
  for (const line of lines) {
    if (!line.includes(id)) continue;
    if (line.length > MAX_INLINE_PAIR_CHARS) {
      if (line.includes("tool_result")) return "too-large";
      continue;
    }
    const record = parseLine(line);
    if (!record) continue;
    const block = findBlock(messageContent(record), "tool_result", "tool_use_id", id);
    if (!block) continue;
    return { content: own(block, "content") };
  }
  return null;
}

function findBlock(
  content: unknown,
  type: string,
  idKey: string,
  id: string
): Record<string, unknown> | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (own(block, "type") === type && own(block, idKey) === id) return block;
  }
  return null;
}

function findCodexCall(
  lines: readonly string[],
  id: string
): { name: string; input: unknown } | null {
  if (!id) return null;
  for (const line of lines) {
    if (!line.includes(id) || line.length > MAX_NEIGHBOR_CHARS) continue;
    const record = parseLine(line);
    if (!record || own(record, "type") !== "response_item") continue;
    const payload = own(record, "payload");
    if (!isRecord(payload)) continue;
    const inner = own(payload, "type");
    if (inner !== "function_call" && inner !== "custom_tool_call") continue;
    if (own(payload, "call_id") !== id) continue;
    const input =
      own(payload, "arguments") !== undefined ? own(payload, "arguments") : own(payload, "input");
    return { name: ownString(payload, "name") ?? "tool", input };
  }
  return null;
}

function findCodexOutput(
  lines: readonly string[],
  id: string
): { output: unknown } | "too-large" | null {
  if (!id) return null;
  for (const line of lines) {
    if (!line.includes(id)) continue;
    if (line.length > MAX_INLINE_PAIR_CHARS) {
      if (line.includes("function_call_output") || line.includes("exec_command_end"))
        return "too-large";
      continue;
    }
    const record = parseLine(line);
    if (!record) continue;
    if (own(record, "type") === "response_item") {
      const payload = own(record, "payload");
      if (
        isRecord(payload) &&
        own(payload, "type") === "function_call_output" &&
        own(payload, "call_id") === id
      ) {
        return { output: own(payload, "output") };
      }
    }
    if (own(record, "type") === "event_msg") {
      const payload = own(record, "payload");
      if (
        isRecord(payload) &&
        own(payload, "type") === "exec_command_end" &&
        own(payload, "call_id") === id
      ) {
        return {
          output:
            own(payload, "stdout") ??
            own(payload, "aggregated_output") ??
            own(payload, "formatted_output"),
        };
      }
    }
  }
  return null;
}

function parseLine(line: string): Record<string, unknown> | null {
  if (line.length > MAX_NEIGHBOR_CHARS) return null;
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function presentClaude(
  record: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const type = ownString(record, "type") ?? "record";
  if (type === "summary") return presentClaudeSummary(record);
  if (type === "user" || type === "assistant") return presentClaudeMessage(record, neighbors);
  return presentLooseMeta(
    record,
    type === "system" ? ownString(record, "subtype") || "system" : type
  );
}

function presentClaudeSummary(record: Record<string, unknown>): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  stampKind(projector, body, "summary");
  const summary = projector.take(record, "summary", ["meta", "summary"], [], false);
  if (summary !== undefined) body.summary = summary;
  const leaf = projector.take(record, "leafUuid", ["meta", "leafUuid"], [], false);
  if (leaf !== undefined) body.leafUuid = leaf;
  return finish(projector, "meta", body, {
    kind: "summary",
    text: typeof body.summary === "string" ? body.summary : undefined,
  });
}

function presentClaudeMessage(
  record: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const message = own(record, "message");
  if (!isRecord(message)) return presentLooseMeta(record, ownString(record, "type") ?? "meta");
  const content = own(message, "content");
  const walkMessage: WalkStep[] = [{ key: "message", parseString: false }];

  if (typeof content === "string") {
    return presentTextRole(
      record,
      own(record, "type") === "assistant" ? "assistant" : "user",
      message,
      "content",
      walkMessage
    );
  }

  const blocks = claudeBlocks(content);
  const tools = blocks.filter(block => block.kind === "tool_use");
  const results = blocks.filter(block => block.kind === "tool_result");
  const texts = blocks.filter(block => block.kind === "text");
  if (results.length > 0 && tools.length === 0) {
    return presentClaudeResults(record, message, results, neighbors);
  }
  if (tools.length > 0 && texts.length === 0) {
    return presentClaudeCalls(record, message, tools, neighbors);
  }
  if (own(record, "type") === "assistant" || tools.length > 0) {
    return presentClaudeAssistant(record, message, texts, tools, neighbors);
  }
  if (texts.length > 0) {
    return presentTextBlocks(record, "user", message, texts, walkMessage);
  }
  return presentLooseMeta(record, "user");
}

function presentTextRole(
  record: Record<string, unknown>,
  role: "user" | "assistant",
  parent: object,
  sourceKey: string,
  walkToParent: WalkStep[]
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const raw = readChild(parent, sourceKey);
  const text = projector.take(parent, sourceKey, [role, "text"], walkToParent, false);
  if (text !== undefined) body.text = text;
  addTimestamp(projector, body, record, [role]);
  return finish(projector, role, body, { text: typeof raw === "string" ? raw : undefined });
}

function presentTextBlocks(
  record: Record<string, unknown>,
  role: "user" | "assistant",
  message: Record<string, unknown>,
  texts: ClaudeBlock[],
  walkMessage: WalkStep[]
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const contentWalk: WalkStep[] = [...walkMessage, { key: "content", parseString: false }];
  if (texts.length === 1) {
    const block = texts[0];
    const walkBlock: WalkStep[] = [...contentWalk, { key: block.index, parseString: false }];
    const content = own(message, "content");
    if (Array.isArray(content) && isRecord(content[block.index])) {
      const text = projector.take(
        content[block.index] as object,
        "text",
        [role, "text"],
        walkBlock,
        false
      );
      if (text !== undefined) body.text = text;
    }
  } else {
    body.parts = texts.map(block => {
      const content = own(message, "content");
      const walkBlock: WalkStep[] = [...contentWalk, { key: block.index, parseString: false }];
      if (!Array.isArray(content) || !isRecord(content[block.index])) return {};
      const text = projector.take(
        content[block.index] as object,
        "text",
        [role, "parts", texts.indexOf(block), "text"],
        walkBlock,
        false
      );
      return text === undefined ? {} : { text };
    });
  }
  addTimestamp(projector, body, record, [role]);
  return finish(projector, role, body, { text: texts.map(block => block.text ?? "").join(" ") });
}

function contentArray(message: Record<string, unknown>): unknown[] {
  const content = own(message, "content");
  return Array.isArray(content) ? content : [];
}

function presentClaudeCalls(
  record: Record<string, unknown>,
  message: Record<string, unknown>,
  tools: ClaudeBlock[],
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const names = tools.map(tool => tool.name ?? "tool");
  const toolName = formatToolNames(names);
  if (tools.length === 1) {
    const body = claudeCallBody(projector, record, message, tools[0], ["tool_call"], neighbors);
    return finish(projector, "tool_call", body, { toolName });
  }
  const body: Record<string, unknown> = {
    tools: tools.map((tool, index) =>
      claudeCallBody(projector, record, message, tool, ["tool_call", "tools", index], neighbors)
    ),
  };
  return finish(projector, "tool_call", body, { toolName });
}

function claudeCallBody(
  projector: Projector,
  record: Record<string, unknown>,
  message: Record<string, unknown>,
  tool: ClaudeBlock,
  prefix: PathSegment[],
  neighbors: SessionNeighbors
): Record<string, unknown> {
  const content = contentArray(message);
  const block = content[tool.index];
  const walkBlock: WalkStep[] = [
    { key: "message", parseString: false },
    { key: "content", parseString: false },
    { key: tool.index, parseString: false },
  ];
  const body: Record<string, unknown> = {};
  if (isRecord(block)) {
    const name = projector.take(block, "name", [...prefix, "name"], walkBlock, false);
    if (name !== undefined) body.name = name;
    const id = projector.take(block, "id", [...prefix, "id"], walkBlock, false);
    if (id !== undefined) body.id = id;
    const input = projector.take(block, "input", [...prefix, "input"], walkBlock, false);
    if (input !== undefined) body.input = input;
  }
  const paired = findClaudeToolResult(neighbors.after ?? [], tool.id ?? "");
  if (paired === "too-large") {
    body.result = "(output is too large to inline — open the following record)";
    projector.lock([...prefix, "result"], "paired");
  } else if (paired && paired.content !== undefined) {
    body.result = projector.showLocked(paired.content, [...prefix, "result"], "paired");
  }
  if (prefix.length === 1) addTimestamp(projector, body, record, prefix);
  return body;
}

function presentClaudeResults(
  record: Record<string, unknown>,
  message: Record<string, unknown>,
  results: ClaudeBlock[],
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const calls = results.map(result => findClaudeToolUse(neighbors.before ?? [], result.id ?? ""));
  const toolName = formatToolNames(
    calls.map((call, index) => call?.name ?? results[index].name ?? "tool")
  );
  if (results.length === 1) {
    const body = claudeResultBody(projector, record, message, results[0], calls[0], [
      "tool_result",
    ]);
    return finish(projector, "tool_result", body, { toolName, text: toolName });
  }
  const body: Record<string, unknown> = {
    results: results.map((result, index) =>
      claudeResultBody(projector, record, message, result, calls[index], [
        "tool_result",
        "results",
        index,
      ])
    ),
  };
  return finish(projector, "tool_result", body, { toolName });
}

function claudeResultBody(
  projector: Projector,
  record: Record<string, unknown>,
  message: Record<string, unknown>,
  result: ClaudeBlock,
  call: { name: string; input: unknown } | null,
  prefix: PathSegment[]
): Record<string, unknown> {
  const content = contentArray(message);
  const block = content[result.index];
  const walkBlock: WalkStep[] = [
    { key: "message", parseString: false },
    { key: "content", parseString: false },
    { key: result.index, parseString: false },
  ];
  const body: Record<string, unknown> = {};
  if (call) {
    body.name = projector.showLocked(call.name, [...prefix, "name"], "paired");
    if (call.input !== undefined) {
      body.input = projector.showLocked(call.input, [...prefix, "input"], "paired");
    }
  }
  if (isRecord(block)) {
    const id = projector.take(block, "tool_use_id", [...prefix, "tool_use_id"], walkBlock, false);
    if (id !== undefined) body.tool_use_id = id;
    if (typeof result.isError === "boolean") {
      const flag = projector.take(block, "is_error", [...prefix, "is_error"], walkBlock, false);
      if (flag !== undefined) body.is_error = flag;
    }
    const output = projector.take(block, "content", [...prefix, "output"], walkBlock, false);
    if (output !== undefined) body.output = output;
  }
  if (prefix.length === 1) addTimestamp(projector, body, record, prefix);
  return body;
}

function presentClaudeAssistant(
  record: Record<string, unknown>,
  message: Record<string, unknown>,
  texts: ClaudeBlock[],
  tools: ClaudeBlock[],
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const content = contentArray(message);
  const contentWalk: WalkStep[] = [
    { key: "message", parseString: false },
    { key: "content", parseString: false },
  ];
  if (texts.length === 1 && isRecord(content[texts[0].index])) {
    const walkBlock = [...contentWalk, { key: texts[0].index, parseString: false }];
    const text = projector.take(
      content[texts[0].index] as object,
      "text",
      ["assistant", "text"],
      walkBlock,
      false
    );
    if (text !== undefined) body.text = text;
  }
  const thinking = claudeBlocks(content).filter(block => block.kind === "thinking");
  if (thinking.length === 1 && isRecord(content[thinking[0].index])) {
    const walkBlock = [...contentWalk, { key: thinking[0].index, parseString: false }];
    const thought = projector.take(
      content[thinking[0].index] as object,
      "thinking",
      ["assistant", "thinking"],
      walkBlock,
      false
    );
    if (thought !== undefined) body.thinking = thought;
  }
  if (tools.length > 0) {
    body.tools = tools.map((tool, index) =>
      claudeCallBody(projector, record, message, tool, ["assistant", "tools", index], neighbors)
    );
  }
  const model = ownString(message, "model");
  if (model && model.length < 120) {
    body.model = model;
    projector.register(
      ["assistant", "model"],
      [
        { key: "message", parseString: false },
        { key: "model", parseString: false },
      ]
    );
  }
  addTimestamp(projector, body, record, ["assistant"]);
  return finish(projector, "assistant", body, {
    text: texts.map(block => block.text ?? "").join(" "),
    toolName:
      tools.length > 0 && texts.length === 0
        ? formatToolNames(tools.map(tool => tool.name ?? "tool"))
        : undefined,
  });
}

function presentLooseMeta(record: Record<string, unknown>, kind: string): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  stampKind(projector, body, kind);
  for (const key of Object.keys(record)) {
    if (key === "type") continue;
    const value = own(record, key);
    if (value === undefined) continue;
    if (typeof value === "string" && value.length > 500) continue;
    if (value !== null && typeof value === "object") {
      if (containerCount(value, 40) > 40) continue;
    }
    const projected = projector.take(record, key, ["meta", key], [], false);
    if (projected !== undefined) body[key] = projected;
  }
  const text = typeof body.summary === "string" ? body.summary : undefined;
  return finish(projector, "meta", body, { kind, text });
}

function presentCodex(
  record: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const type = ownString(record, "type") ?? "record";
  const payload = own(record, "payload");
  if (type === "session_meta" && isRecord(payload)) return presentCodexSession(record, payload);
  if (type === "turn_context" && isRecord(payload)) return presentCodexTurn(record, payload);
  if (type === "response_item" && isRecord(payload))
    return presentCodexResponse(record, payload, neighbors);
  if (type === "event_msg" && isRecord(payload))
    return presentCodexEvent(record, payload, neighbors);
  return presentLooseMeta(record, type);
}

const SESSION_FIELDS = [
  "id",
  "cwd",
  "originator",
  "cli_version",
  "model_provider",
  "source",
  "timestamp",
];

function presentCodexSession(
  record: Record<string, unknown>,
  payload: Record<string, unknown>
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  stampKind(projector, body, "session");
  const walkPayload: WalkStep[] = [{ key: "payload", parseString: false }];
  for (const key of SESSION_FIELDS) {
    const value = projector.take(payload, key, ["meta", key], walkPayload, false);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      body[key] = value;
    }
  }
  addTimestamp(projector, body, record, ["meta"]);
  const cwd = typeof body.cwd === "string" ? body.cwd : undefined;
  return finish(projector, "meta", body, {
    kind: cwd ? `session ${firstWords(cwd, 48)}` : "session",
  });
}

function presentCodexTurn(
  record: Record<string, unknown>,
  payload: Record<string, unknown>
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  stampKind(projector, body, "turn");
  const walkPayload: WalkStep[] = [{ key: "payload", parseString: false }];
  for (const key of Object.keys(payload)) {
    if (/instruction/i.test(key)) continue;
    const raw = own(payload, key);
    if (typeof raw === "string" && raw.length > 240) continue;
    if (raw !== null && typeof raw === "object") continue;
    const value = projector.take(payload, key, ["meta", key], walkPayload, false);
    if (value !== undefined && (typeof value !== "object" || value === null)) body[key] = value;
  }
  addTimestamp(projector, body, record, ["meta"]);
  const model = typeof body.model === "string" ? body.model : undefined;
  return finish(projector, "meta", body, { kind: model ? `turn ${model}` : "turn" });
}

function presentCodexResponse(
  record: Record<string, unknown>,
  payload: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const inner = ownString(payload, "type") ?? "response";
  if (inner === "function_call" || inner === "custom_tool_call") {
    return presentCodexCall(record, payload, neighbors);
  }
  if (inner === "function_call_output") return presentCodexResult(record, payload, neighbors);
  if (inner === "message") return presentCodexMessage(record, payload);
  if (inner === "reasoning") return presentLooseMeta(record, "reasoning");
  return presentLooseMeta(record, inner);
}

function presentCodexCall(
  record: Record<string, unknown>,
  payload: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const walkPayload: WalkStep[] = [{ key: "payload", parseString: false }];
  const name = projector.take(payload, "name", ["tool_call", "name"], walkPayload, false);
  if (name !== undefined) body.name = name;
  const callId = projector.take(payload, "call_id", ["tool_call", "call_id"], walkPayload, false);
  if (callId !== undefined) body.call_id = callId;
  const inputKey = own(payload, "arguments") !== undefined ? "arguments" : "input";
  if (own(payload, inputKey) !== undefined) {
    const input = projector.take(payload, inputKey, ["tool_call", "input"], walkPayload, false);
    if (input !== undefined) body.input = input;
  }
  const id =
    typeof body.call_id === "string" ? body.call_id : (ownString(payload, "call_id") ?? "");
  const paired = findCodexOutput(neighbors.after ?? [], id);
  if (paired === "too-large") {
    body.result = "(output is too large to inline — open the following record)";
    projector.lock(["tool_call", "result"], "paired");
  } else if (paired && paired.output !== undefined) {
    body.result = projector.showLocked(paired.output, ["tool_call", "result"], "paired");
  }
  addTimestamp(projector, body, record, ["tool_call"]);
  const toolName = typeof body.name === "string" ? body.name : ownString(payload, "name");
  return finish(projector, "tool_call", body, { toolName });
}

function presentCodexResult(
  record: Record<string, unknown>,
  payload: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const walkPayload: WalkStep[] = [{ key: "payload", parseString: false }];
  const id = ownString(payload, "call_id") ?? "";
  const call = findCodexCall(neighbors.before ?? [], id);
  if (call) {
    body.name = projector.showLocked(call.name, ["tool_result", "name"], "paired");
    if (call.input !== undefined) {
      body.input = projector.showLocked(call.input, ["tool_result", "input"], "paired");
    }
  }
  const callId = projector.take(payload, "call_id", ["tool_result", "call_id"], walkPayload, false);
  if (callId !== undefined) body.call_id = callId;
  const output = projector.take(payload, "output", ["tool_result", "output"], walkPayload, false);
  if (output !== undefined) body.output = output;
  addTimestamp(projector, body, record, ["tool_result"]);
  return finish(projector, "tool_result", body, { toolName: call?.name });
}

function codexTextBlocks(content: unknown, blockType: string): { index: number; text: string }[] {
  if (!Array.isArray(content)) return [];
  const blocks: { index: number; text: string }[] = [];
  content.forEach((block, index) => {
    if (!isRecord(block)) return;
    if (own(block, "type") !== blockType) return;
    const text = own(block, "text");
    if (typeof text === "string") blocks.push({ index, text });
  });
  return blocks;
}

function presentCodexMessage(
  record: Record<string, unknown>,
  payload: Record<string, unknown>
): SessionPresentation {
  const roleName = ownString(payload, "role");
  const blockType = roleName === "assistant" ? "output_text" : "input_text";
  const blocks = codexTextBlocks(own(payload, "content"), blockType);
  const prose = blocks.map(block => block.text).join("\n");
  if (prose.startsWith("gAAAAA")) return presentLooseMeta(record, "encrypted agent message");
  if (roleName === "developer" || (roleName !== "user" && roleName !== "assistant")) {
    return presentLooseMeta(
      record,
      roleName === "developer" ? "developer" : (roleName ?? "message")
    );
  }
  const role: "user" | "assistant" = roleName === "assistant" ? "assistant" : "user";
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const content = own(payload, "content");
  const walkContent: WalkStep[] = [
    { key: "payload", parseString: false },
    { key: "content", parseString: false },
  ];
  if (blocks.length === 1 && Array.isArray(content) && isRecord(content[blocks[0].index])) {
    const walkBlock = [...walkContent, { key: blocks[0].index, parseString: false }];
    const text = projector.take(
      content[blocks[0].index] as object,
      "text",
      [role, "text"],
      walkBlock,
      false
    );
    if (text !== undefined) body.text = text;
  } else if (blocks.length > 1 && Array.isArray(content)) {
    body.parts = blocks.map((block, index) => {
      if (!isRecord(content[block.index])) return {};
      const walkBlock = [...walkContent, { key: block.index, parseString: false }];
      const text = projector.take(
        content[block.index] as object,
        "text",
        [role, "parts", index, "text"],
        walkBlock,
        false
      );
      return text === undefined ? {} : { text };
    });
  }
  addTimestamp(projector, body, record, [role]);
  return finish(projector, role, body, { text: prose });
}

function presentCodexEvent(
  record: Record<string, unknown>,
  payload: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const inner = ownString(payload, "type") ?? "event";
  if (inner === "user_message" || inner === "agent_message") {
    const text = ownString(payload, "message") ?? "";
    if (text.startsWith("gAAAAA")) {
      return presentLooseMeta(record, "encrypted agent message");
    }
    const role: "user" | "assistant" = inner === "user_message" ? "user" : "assistant";
    const projector = new Projector();
    const body: Record<string, unknown> = {};
    const message = projector.take(
      payload,
      "message",
      [role, "text"],
      [{ key: "payload", parseString: false }],
      false
    );
    if (message !== undefined) body.text = message;
    addTimestamp(projector, body, record, [role]);
    return finish(projector, role, body, { text });
  }
  if (inner === "exec_command_end") return presentExecEnd(record, payload, neighbors);
  return presentLooseMeta(record, inner.replace(/_/g, " "));
}

function presentExecEnd(
  record: Record<string, unknown>,
  payload: Record<string, unknown>,
  neighbors: SessionNeighbors
): SessionPresentation {
  const projector = new Projector();
  const body: Record<string, unknown> = {};
  const walkPayload: WalkStep[] = [{ key: "payload", parseString: false }];
  const id = ownString(payload, "call_id") ?? "";
  const call = findCodexCall(neighbors.before ?? [], id);
  if (call) body.name = projector.showLocked(call.name, ["tool_result", "name"], "paired");
  for (const key of ["call_id", "exit_code", "status"] as const) {
    if (own(payload, key) === undefined) continue;
    const value = projector.take(payload, key, ["tool_result", key], walkPayload, false);
    if (value !== undefined) body[key] = value;
  }
  const outputKey =
    own(payload, "stdout") !== undefined
      ? "stdout"
      : own(payload, "aggregated_output") !== undefined
        ? "aggregated_output"
        : "formatted_output";
  if (own(payload, outputKey) !== undefined) {
    const output = projector.take(
      payload,
      outputKey,
      ["tool_result", "output"],
      walkPayload,
      false
    );
    if (output !== undefined) body.output = output;
  }
  addTimestamp(projector, body, record, ["tool_result"]);
  return finish(projector, "tool_result", body, { toolName: call?.name ?? "exec" });
}

function presentGeneric(value: unknown): SessionPresentation {
  const projector = new Projector();
  if (isJsonScalar(value)) {
    // Empty walk replaces the whole line, which is itself a scalar.
    projector.register(["record", "value"], [], true);
    return finish(
      projector,
      "record",
      { value },
      { text: typeof value === "string" ? value : undefined }
    );
  }
  if (Array.isArray(value)) {
    const items = value.map((_, index) =>
      projector.take(value, index, ["record", "items", index], [], false)
    );
    return finish(projector, "record", { items }, { kind: "record" });
  }
  const record = isRecord(value) ? value : null;
  const hinted = record ? genericRole(record) : "record";
  const role: SessionRole = hinted === "user" || hinted === "assistant" ? hinted : "record";
  const body: Record<string, unknown> = {};
  if (record) {
    for (const key of Object.keys(record)) {
      const child = projector.take(record, key, [role, key], [], false);
      if (child !== undefined) body[key] = child;
    }
  }
  return finish(projector, role, body, {
    text: firstString(value),
    kind: role === "record" ? "record" : undefined,
  });
}

function genericRole(record: Record<string, unknown>): SessionRole {
  const type = own(record, "type");
  const role = own(record, "role");
  if (type === "user" || role === "user") return "user";
  if (type === "assistant" || role === "assistant") return "assistant";
  return "record";
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const key of Object.keys(value)) {
    const child = own(value, key);
    if (typeof child === "string" && child.trim()) return child;
  }
  return undefined;
}

function looksLikeClaude(record: Record<string, unknown>): boolean {
  const type = ownString(record, "type");
  if (!type) return false;
  if (type === "user" || type === "assistant") return isRecord(own(record, "message"));
  if (type === "summary") return typeof own(record, "summary") === "string";
  return (
    type === "system" ||
    type === "progress" ||
    type === "file-history-snapshot" ||
    type === "queue-operation" ||
    type === "attachment"
  );
}

function looksLikeCodex(record: Record<string, unknown>): boolean {
  const type = ownString(record, "type");
  if (!type || !isStringTimestamp(record)) return false;
  return isRecord(own(record, "payload"));
}

function isStringTimestamp(record: Record<string, unknown>): boolean {
  return typeof own(record, "timestamp") === "string";
}

/**
 * Build the session view for one line. `family` comes from file detection;
 * `generic` still recognizes a Claude or Codex record when the toggle is forced
 * on. Returns null when the line is not JSON.
 */
export function presentSessionLine(
  lineText: string,
  family: AgentFamily | "generic",
  neighbors: SessionNeighbors = {}
): SessionPresentation | null {
  if (lineText.length > 4_000_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(lineText);
  } catch {
    return null;
  }
  if (isRecord(value)) {
    if (family === "codex") return presentCodex(value, neighbors);
    if (family === "claude") return presentClaude(value, neighbors);
    if (looksLikeCodex(value) && !looksLikeClaude(value)) return presentCodex(value, neighbors);
    if (looksLikeClaude(value)) return presentClaude(value, neighbors);
  }
  return presentGeneric(value);
}

function failureForPath(
  locks: readonly SessionLock[],
  path: readonly PathSegment[]
): SessionEditFailure | null {
  const hits = locks.filter(lock => isPrefix(lock.path, path));
  if (hits.length === 0) return null;
  if (hits.some(hit => hit.reason === "truncated")) return "truncated";
  if (hits.some(hit => hit.reason === "synthetic")) return "synthetic";
  return "readonly";
}

/**
 * Apply a scalar edit made against the session view. `context` null keeps the
 * raw JSONL path (agent session mode off) and never unwraps JSON strings.
 */
export function editRecord(
  lineText: string,
  path: PathSegment[],
  value: Scalar,
  context: SessionEditContext | null
): SessionEditResult {
  if (!context) return applyScalarEdit(lineText, path, value);
  const view = presentSessionLine(lineText, context.family, {
    before: context.before,
    after: context.after,
  });
  if (!view) return { ok: false, reason: "invalid-json" };
  const locked = failureForPath(view.locks, path);
  if (locked) return { ok: false, reason: locked };
  const walk = view.writes.get(pathKey(path));
  if (!walk) return { ok: false, reason: "bad-path" };
  return applyWalkEdit(lineText, walk, value);
}

export function describeSessionEditFailure(reason: SessionEditFailure): string {
  switch (reason) {
    case "readonly":
      return "JSONL Vision left this line unchanged. That value is copied from the paired record and can only be edited there.";
    case "truncated":
      return "JSONL Vision left this line unchanged. Session view shortens long text — turn agent session mode off to edit the full value.";
    case "synthetic":
      return "JSONL Vision left this line unchanged. That label is only in the session view and is not stored in the file.";
    case "invalid-json":
      return "JSONL Vision couldn't update this line because it is not valid JSON.";
    case "bad-value":
      return "JSONL Vision couldn't update this line because that value is not a finite JSON scalar.";
    case "bad-path":
      return "JSONL Vision couldn't update this line because that field is not a scalar on it.";
  }
}

/**
 * Tab suffix for one line, without reading neighbors. Null when the line is
 * not JSON. Huge lines are not parsed.
 */
export function sessionTabHint(
  lineText: string,
  family: AgentFamily | "generic"
): { role: SessionRole; hint: string } | null {
  if (lineText.length > MAX_NEIGHBOR_CHARS) return { role: "meta", hint: "large record" };
  const view = presentSessionLine(lineText, family);
  if (!view) return null;
  return { role: view.role, hint: view.tabHint };
}
