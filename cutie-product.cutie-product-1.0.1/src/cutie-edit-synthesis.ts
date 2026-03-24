import { diffLines } from "diff";
import type {
  CutieEditAnchor,
  CutieEditIntent,
  CutieEditOperation,
  CutieEditPlan,
  CutieEditPlanConfidence,
  CutieEditRealizationResult,
  CutieEditTarget,
  CutieTaskFrame,
  CutieToolCall,
} from "./types";
import { randomId } from "./cutie-policy";

type SynthesisTargetState = {
  path: string;
  content: string;
  revisionId?: string;
};

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function splitLines(value: string): string[] {
  return String(value || "").split(/\r?\n/);
}

function countLines(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/\r\n/g, "\n");
  if (normalized.endsWith("\n")) return normalized.split("\n").length - 1;
  return normalized.split("\n").length;
}

function stripFinalNewline(value: string): string {
  return String(value || "").replace(/\r?\n$/, "");
}

function detectNewline(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function resolveAnchorLine(lines: string[], anchor: CutieEditAnchor): number {
  const matches: number[] = [];
  const loweredQuery = anchor.query.toLowerCase();
  const regex = anchor.kind === "line_regex" ? new RegExp(anchor.query) : null;
  lines.forEach((line, index) => {
    const hit =
      anchor.kind === "line_contains"
        ? line.toLowerCase().includes(loweredQuery)
        : Boolean(regex?.test(line));
    if (hit) matches.push(index);
  });
  if (!matches.length) return -1;
  return anchor.occurrence === "first" ? matches[0] : matches[matches.length - 1];
}

function appendCallArguments(line: string, argsToAdd: string[]): string {
  const closeIndex = line.lastIndexOf(")");
  if (closeIndex < 0) return line;
  const current = line;
  const missing = argsToAdd.filter((arg) => !current.includes(arg));
  if (!missing.length) return line;
  return `${line.slice(0, closeIndex).trimEnd()}, ${missing.join(", ")}${line.slice(closeIndex)}`;
}

function applyEditOperation(lines: string[], op: CutieEditOperation): { nextLines: string[]; applied: boolean; reason?: string } {
  const anchorIndex = resolveAnchorLine(lines, op.anchor);
  if (anchorIndex < 0) {
    return { nextLines: lines, applied: false, reason: `Anchor not found for ${op.description}.` };
  }
  const nextLines = [...lines];
  switch (op.kind) {
    case "insert_before": {
      const block = String(op.text || "");
      if (!block.trim()) return { nextLines, applied: false, reason: `No insert block for ${op.description}.` };
      const insertLines = splitLines(block);
      const existingBlock = nextLines.slice(anchorIndex - insertLines.length, anchorIndex).join("\n");
      if (existingBlock === block) return { nextLines, applied: false };
      nextLines.splice(anchorIndex, 0, ...insertLines);
      return { nextLines, applied: true };
    }
    case "insert_after": {
      const block = String(op.text || "");
      if (!block.trim()) return { nextLines, applied: false, reason: `No insert block for ${op.description}.` };
      const insertLines = splitLines(block);
      const existingBlock = nextLines.slice(anchorIndex + 1, anchorIndex + 1 + insertLines.length).join("\n");
      if (existingBlock === block) return { nextLines, applied: false };
      nextLines.splice(anchorIndex + 1, 0, ...insertLines);
      return { nextLines, applied: true };
    }
    case "replace_block": {
      const deleteLineCount = Math.max(0, Number(op.deleteLineCount || 0));
      const replacement = splitLines(String(op.text || ""));
      const existing = nextLines.slice(anchorIndex, anchorIndex + deleteLineCount).join("\n");
      if (existing === String(op.text || "")) return { nextLines, applied: false };
      nextLines.splice(anchorIndex, deleteLineCount, ...replacement);
      return { nextLines, applied: true };
    }
    case "remove_block": {
      const deleteLineCount = Math.max(1, Number(op.deleteLineCount || 1));
      nextLines.splice(anchorIndex, deleteLineCount);
      return { nextLines, applied: true };
    }
    case "replace_value": {
      const searchValue = String(op.searchValue || "");
      const replaceValue = String(op.replaceValue || "");
      if (!searchValue || !nextLines[anchorIndex]?.includes(searchValue)) {
        return { nextLines, applied: false, reason: `Replace target not found for ${op.description}.` };
      }
      const nextLine = nextLines[anchorIndex].replace(searchValue, replaceValue);
      if (nextLine === nextLines[anchorIndex]) return { nextLines, applied: false };
      nextLines[anchorIndex] = nextLine;
      return { nextLines, applied: true };
    }
    case "extend_call_args": {
      const nextLine = appendCallArguments(nextLines[anchorIndex], op.argsToAdd || []);
      if (nextLine === nextLines[anchorIndex]) return { nextLines, applied: false };
      nextLines[anchorIndex] = nextLine;
      return { nextLines, applied: true };
    }
    default:
      return { nextLines, applied: false, reason: `Unsupported operation ${(op as { kind?: string }).kind || "unknown"}.` };
  }
}

function isPineStrategyContent(content: string): boolean {
  return /\/\/@version=\d+/i.test(content) && /\bstrategy\s*\(/.test(content);
}

function lastInputAnchor(content: string): CutieEditAnchor | null {
  const lines = splitLines(content);
  const hasInput = lines.some((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*input\./.test(line));
  return hasInput ? { kind: "line_regex", query: "^\\s*[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*input\\.", occurrence: "last" } : null;
}

function buildTrailingStopOperations(target: SynthesisTargetState): CutieEditOperation[] {
  const ops: CutieEditOperation[] = [];
  const inputAnchor = lastInputAnchor(target.content);
  if (inputAnchor && !/\btrail_points\s*=/.test(target.content)) {
    ops.push({
      kind: "insert_after",
      description: "add trailing stop input",
      anchor: inputAnchor,
      text: ['// Trailing stop distance in price points.', 'trail_points = input.float(0.5, "Trailing Stop Distance (points)", minval=0.0)'].join("\n"),
    });
  }
  if (/strategy\.exit\s*\(/.test(target.content)) {
    if (!/strategy\.exit\([^\n]*from_entry\s*=\s*"Long"[^\n]*trail_points\s*=/.test(target.content)) {
      ops.push({
        kind: "extend_call_args",
        description: "extend long exit with trailing stop arguments",
        anchor: { kind: "line_regex", query: 'strategy\\.exit\\([^\\n]*from_entry\\s*=\\s*"Long"', occurrence: "last" },
        argsToAdd: ["trail_points=trail_points", "trail_offset=trail_points"],
      });
    }
    if (!/strategy\.exit\([^\n]*from_entry\s*=\s*"Short"[^\n]*trail_points\s*=/.test(target.content)) {
      ops.push({
        kind: "extend_call_args",
        description: "extend short exit with trailing stop arguments",
        anchor: { kind: "line_regex", query: 'strategy\\.exit\\([^\\n]*from_entry\\s*=\\s*"Short"', occurrence: "last" },
        argsToAdd: ["trail_points=trail_points", "trail_offset=trail_points"],
      });
    }
  } else {
    ops.push({
      kind: "insert_after",
      description: "add long trailing stop exit after entry",
      anchor: { kind: "line_regex", query: 'strategy\\.entry\\("Long"', occurrence: "last" },
      text: 'strategy.exit("LongTrail", from_entry="Long", trail_points=trail_points, trail_offset=trail_points)',
    });
    ops.push({
      kind: "insert_after",
      description: "add short trailing stop exit after entry",
      anchor: { kind: "line_regex", query: 'strategy\\.entry\\("Short"', occurrence: "last" },
      text: 'strategy.exit("ShortTrail", from_entry="Short", trail_points=trail_points, trail_offset=trail_points)',
    });
  }
  return ops;
}

function buildTakeProfitOperations(target: SynthesisTargetState): CutieEditOperation[] {
  const ops: CutieEditOperation[] = [];
  const inputAnchor = lastInputAnchor(target.content);
  if (inputAnchor && !/\btake_profit_points\s*=/.test(target.content)) {
    ops.push({
      kind: "insert_after",
      description: "add take profit input",
      anchor: inputAnchor,
      text: ['// Take profit distance in price points.', 'take_profit_points = input.float(1.0, "Take Profit Distance (points)", minval=0.0)'].join("\n"),
    });
  }
  if (/strategy\.exit\s*\(/.test(target.content)) {
    if (!/strategy\.exit\([^\n]*from_entry\s*=\s*"Long"[^\n]*limit\s*=/.test(target.content)) {
      ops.push({
        kind: "extend_call_args",
        description: "extend long exit with take profit limit",
        anchor: { kind: "line_regex", query: 'strategy\\.exit\\([^\\n]*from_entry\\s*=\\s*"Long"', occurrence: "last" },
        argsToAdd: ["limit=strategy.position_avg_price + take_profit_points"],
      });
    }
    if (!/strategy\.exit\([^\n]*from_entry\s*=\s*"Short"[^\n]*limit\s*=/.test(target.content)) {
      ops.push({
        kind: "extend_call_args",
        description: "extend short exit with take profit limit",
        anchor: { kind: "line_regex", query: 'strategy\\.exit\\([^\\n]*from_entry\\s*=\\s*"Short"', occurrence: "last" },
        argsToAdd: ["limit=strategy.position_avg_price - take_profit_points"],
      });
    }
  } else {
    ops.push({
      kind: "insert_after",
      description: "add long take profit exit after entry",
      anchor: { kind: "line_regex", query: 'strategy\\.entry\\("Long"', occurrence: "last" },
      text: 'strategy.exit("LongTakeProfit", from_entry="Long", limit=strategy.position_avg_price + take_profit_points)',
    });
    ops.push({
      kind: "insert_after",
      description: "add short take profit exit after entry",
      anchor: { kind: "line_regex", query: 'strategy\\.entry\\("Short"', occurrence: "last" },
      text: 'strategy.exit("ShortTakeProfit", from_entry="Short", limit=strategy.position_avg_price - take_profit_points)',
    });
  }
  return ops;
}

function buildRemoveIdentifierOperations(target: SynthesisTargetState, taskFrame: CutieTaskFrame): CutieEditOperation[] {
  const query = taskFrame.semanticQueries.find((item) => item.includes("_")) || taskFrame.entity;
  return [
    {
      kind: "remove_block",
      description: `remove ${taskFrame.entityLabel} declaration`,
      anchor: { kind: "line_contains", query, occurrence: "first" },
      deleteLineCount: 1,
    },
  ];
}

function synthesizeOperationsForTarget(input: {
  taskFrame: CutieTaskFrame;
  target: SynthesisTargetState;
}): CutieEditOperation[] {
  if (!isPineStrategyContent(input.target.content)) {
    if (input.taskFrame.action === "remove") {
      return buildRemoveIdentifierOperations(input.target, input.taskFrame);
    }
    return [];
  }
  if (input.taskFrame.action === "add" && ["stop_loss", "trailing_stop_loss"].includes(input.taskFrame.entity)) {
    return buildTrailingStopOperations(input.target);
  }
  if (input.taskFrame.action === "add" && input.taskFrame.entity === "take_profit") {
    return buildTakeProfitOperations(input.target);
  }
  if (input.taskFrame.action === "remove") {
    return buildRemoveIdentifierOperations(input.target, input.taskFrame);
  }
  return [];
}

export function buildEditIntent(input: {
  prompt: string;
  taskFrame: CutieTaskFrame;
  targetPaths: string[];
}): CutieEditIntent {
  return {
    action: input.taskFrame.action,
    entity: input.taskFrame.entity,
    entityLabel: input.taskFrame.entityLabel,
    scope: input.targetPaths.length > 1 ? "multi_file" : "single_file",
    confidence: input.taskFrame.confidence,
    requestedOutcomes: dedupeStrings([input.taskFrame.entityLabel, ...input.taskFrame.semanticQueries]).slice(0, 8),
    inferredConstraints: dedupeStrings([
      "serial_mutation_only",
      "patch_first",
      "verify_before_finish",
      input.targetPaths.length > 1 ? "multi_file_plan" : "single_file_plan",
    ]),
    targetPaths: input.targetPaths,
  };
}

export function synthesizeEditPlan(input: {
  prompt: string;
  taskFrame: CutieTaskFrame;
  targets: SynthesisTargetState[];
}): { intent: CutieEditIntent; plan: CutieEditPlan | null; failureReason?: string } {
  const intent = buildEditIntent({
    prompt: input.prompt,
    taskFrame: input.taskFrame,
    targetPaths: input.targets.map((target) => target.path),
  });
  const planTargets: CutieEditTarget[] = [];
  for (const target of input.targets) {
    const operations = synthesizeOperationsForTarget({
      taskFrame: input.taskFrame,
      target,
    });
    if (!operations.length) continue;
    planTargets.push({
      path: target.path,
      revisionId: target.revisionId,
      operations,
      verificationHints: ["get_diagnostics"],
    });
  }
  if (!planTargets.length) {
    return {
      intent,
      plan: null,
      failureReason: `No anchor-based edit plan could be synthesized for ${input.taskFrame.entityLabel}.`,
    };
  }
  const confidence: CutieEditPlanConfidence = planTargets.length === input.targets.length ? "high" : "medium";
  return {
    intent,
    plan: {
      targets: planTargets,
      realizationPreference: "patch_first",
      verificationHints: ["get_diagnostics"],
      confidence,
      ...(planTargets.length < input.targets.length ? { fallbackReason: "Only a subset of targets could be grounded." } : {}),
    },
  };
}

function derivePatchEdits(before: string, after: string): Array<{ startLine: number; deleteLineCount: number; replacement: string }> {
  const changes = diffLines(before, after);
  const edits: Array<{ startLine: number; deleteLineCount: number; replacement: string }> = [];
  let currentLine = 1;
  for (let i = 0; i < changes.length; i += 1) {
    const part = changes[i];
    if (!part.added && !part.removed) {
      currentLine += countLines(part.value);
      continue;
    }
    if (part.removed) {
      const next = changes[i + 1];
      const replacement = next?.added ? stripFinalNewline(next.value) : "";
      edits.push({
        startLine: currentLine,
        deleteLineCount: countLines(part.value),
        replacement,
      });
      if (next?.added) i += 1;
      continue;
    }
    edits.push({
      startLine: currentLine,
      deleteLineCount: 0,
      replacement: stripFinalNewline(part.value),
    });
    currentLine += countLines(part.value);
  }
  return edits;
}

function realizeTarget(input: {
  target: CutieEditTarget;
  content: string;
}): { content: string; failureReason?: string } {
  let lines = splitLines(input.content);
  let appliedAny = false;
  for (const op of input.target.operations) {
    const applied = applyEditOperation(lines, op);
    if (applied.reason) {
      return { content: input.content, failureReason: applied.reason };
    }
    lines = applied.nextLines;
    appliedAny = appliedAny || applied.applied;
  }
  const newline = detectNewline(input.content);
  const content = lines.join(newline);
  return { content: appliedAny ? content : input.content };
}

export function realizeEditPlan(input: {
  plan: CutieEditPlan;
  latestFileStates: Map<string, { path: string; content: string; revisionId?: string; full?: boolean }>;
}): CutieEditRealizationResult {
  if (!input.plan.targets.length) {
    return {
      mode: "unrealizable",
      toolCall: null,
      realizedTargetPaths: [],
      failureReason: "Edit plan contains no targets.",
    };
  }
  const target = input.plan.targets[0];
  const latestState = input.latestFileStates.get(target.path);
  if (!latestState?.content) {
    return {
      mode: "unrealizable",
      toolCall: null,
      realizedTargetPaths: [],
      failureReason: `Latest inspected content is unavailable for ${target.path}.`,
    };
  }
  const realized = realizeTarget({
    target,
    content: latestState.content,
  });
  if (realized.failureReason) {
    return {
      mode: "unrealizable",
      toolCall: null,
      realizedTargetPaths: [],
      failedTargetPaths: [target.path],
      failureReason: realized.failureReason,
    };
  }
  if (realized.content === latestState.content) {
    return {
      mode: "unrealizable",
      toolCall: null,
      realizedTargetPaths: [],
      failedTargetPaths: [target.path],
      failureReason: `Edit plan for ${target.path} did not change the file.`,
    };
  }
  const edits = derivePatchEdits(latestState.content, realized.content);
  if (edits.length && edits.length <= 6) {
    const toolCall: CutieToolCall = {
      id: randomId("cutie_tool"),
      name: "patch_file",
      arguments: {
        path: target.path,
        ...(latestState.revisionId ? { baseRevision: latestState.revisionId } : {}),
        edits,
      },
      summary: `applying synthesized edit plan to ${target.path}`,
    };
    return {
      mode: "patch_file",
      toolCall,
      realizedTargetPaths: [target.path],
    };
  }
  return {
    mode: "write_file",
    toolCall: {
      id: randomId("cutie_tool"),
      name: "write_file",
      arguments: {
        path: target.path,
        content: realized.content,
        overwrite: true,
        ...(latestState.revisionId ? { baseRevision: latestState.revisionId } : {}),
      },
      summary: `rewriting ${target.path} from synthesized edit plan`,
    },
    realizedTargetPaths: [target.path],
  };
}
