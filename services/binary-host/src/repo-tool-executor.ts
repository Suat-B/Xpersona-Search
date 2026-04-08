import { RepoModelService } from "./repo-model.js";

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function fail(toolCall: ToolCall, summary: string): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: false,
    summary,
    error: summary,
    createdAt: nowIso(),
  };
}

function ok(toolCall: ToolCall, summary: string, data: Record<string, unknown> = {}): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: true,
    summary,
    data: {
      lane: "repo_model",
      ...data,
    },
    createdAt: nowIso(),
  };
}

function formatRepoEngine(engine: unknown): string {
  if (engine === "ast_grep") return "ast-grep";
  if (engine === "tree_sitter") return "tree-sitter";
  if (engine === "heuristic") return "heuristic scan";
  return "repo model";
}

function buildRepoSearchGuidance(phase: "summary" | "symbols" | "references"): Record<string, unknown> {
  return {
    phase,
    preferredToolOrder: ["search_workspace", "repo_query_symbols", "repo_find_references"],
    engineOrder: ["ast_grep", "tree_sitter", "heuristic"],
    guidance: [
      "Start with search_workspace for broad text or file discovery.",
      "Escalate to repo_query_symbols when you have a likely symbol name or path.",
      "Use repo_find_references after you confirm the symbol and need impact across files.",
    ],
  };
}

export class RepoToolExecutor {
  constructor(private readonly repoModel: RepoModelService, private readonly workspaceRoot: string) {}

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};

    if (toolCall.name === "repo_get_summary") {
      const summary = await this.repoModel.getSummary(
        this.workspaceRoot,
        typeof args.task === "string" ? args.task : undefined
      );
      return ok(toolCall, "Loaded the current repo model summary with repo search guidance.", {
        ...(summary as Record<string, unknown>),
        repoSearchGuidance: buildRepoSearchGuidance("summary"),
      });
    }

    if (toolCall.name === "repo_query_symbols") {
      const result = await this.repoModel.querySymbols(this.workspaceRoot, {
        query: typeof args.query === "string" ? args.query : undefined,
        path: typeof args.path === "string" ? args.path : undefined,
        limit: clamp(Number(args.limit || 12), 1, 60),
      });
      return ok(toolCall, `Loaded ${result.symbols.length} repo symbol(s) via ${formatRepoEngine(result.engine)}.`, {
        ...(result as Record<string, unknown>),
        recommendedNextTool: result.symbols.length ? "repo_find_references" : "search_workspace",
        repoSearchGuidance: buildRepoSearchGuidance("symbols"),
      });
    }

    if (toolCall.name === "repo_find_references") {
      const symbol = compactWhitespace(args.symbol);
      if (!symbol) return fail(toolCall, "repo_find_references requires symbol.");
      const result = await this.repoModel.findReferences(this.workspaceRoot, {
        symbol,
        limit: clamp(Number(args.limit || 20), 1, 80),
      });
      return ok(
        toolCall,
        result.references.length
          ? `Found ${result.references.length} reference(s) for ${symbol} via ${formatRepoEngine(result.engine)}.`
          : `No references were found for ${symbol}; ${formatRepoEngine(result.engine)} did not surface any matches.`,
        {
          ...(result as unknown as Record<string, unknown>),
          recommendedNextTool: result.references.length ? "repo_get_change_impact" : "search_workspace",
          repoSearchGuidance: buildRepoSearchGuidance("references"),
        }
      );
    }

    if (toolCall.name === "repo_get_change_impact") {
      const result = await this.repoModel.getChangeImpact(this.workspaceRoot, {
        path: typeof args.path === "string" ? args.path : undefined,
        symbol: typeof args.symbol === "string" ? args.symbol : undefined,
        limit: clamp(Number(args.limit || 12), 1, 60),
      });
      return ok(toolCall, `Calculated change impact for ${result.subject}.`, result as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "repo_get_validation_plan") {
      const result = await this.repoModel.getValidationPlan(this.workspaceRoot, {
        paths: Array.isArray(args.paths) ? args.paths.map((item) => String(item)) : undefined,
      });
      return ok(
        toolCall,
        result.primaryCommand
          ? `Loaded repo validation plan with primary command ${result.primaryCommand}.`
          : "Loaded repo validation plan without a canonical command.",
        result as unknown as Record<string, unknown>
      );
    }

    if (toolCall.name === "repo_record_verification") {
      const label = compactWhitespace(args.label);
      if (!label) return fail(toolCall, "repo_record_verification requires label.");
      const status =
        args.status === "running" || args.status === "passed" || args.status === "failed" ? args.status : "pending";
      const receipt = await this.repoModel.recordVerification(this.workspaceRoot, {
        label,
        summary: compactWhitespace(args.summary || label || "Recorded verification result"),
        status,
        command: typeof args.command === "string" ? args.command : undefined,
        failureCategory: typeof args.failureCategory === "string" ? args.failureCategory : undefined,
        targetHint: typeof args.targetHint === "string" ? args.targetHint : undefined,
      });
      return ok(toolCall, receipt.summary, receipt as unknown as Record<string, unknown>);
    }

    return fail(toolCall, `Unknown repo-model tool ${toolCall.name}.`);
  }
}
