function nowIso() {
    return new Date().toISOString();
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}
function fail(toolCall, summary) {
    return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        summary,
        error: summary,
        createdAt: nowIso(),
    };
}
function ok(toolCall, summary, data = {}) {
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
function formatRepoEngine(engine) {
    if (engine === "ast_grep")
        return "ast-grep";
    if (engine === "tree_sitter")
        return "tree-sitter";
    if (engine === "heuristic")
        return "heuristic scan";
    return "repo model";
}
function buildRepoSearchGuidance(phase) {
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
    repoModel;
    workspaceRoot;
    constructor(repoModel, workspaceRoot) {
        this.repoModel = repoModel;
        this.workspaceRoot = workspaceRoot;
    }
    async execute(pendingToolCall) {
        const toolCall = pendingToolCall.toolCall;
        const args = toolCall.arguments || {};
        if (toolCall.name === "repo_get_summary") {
            const summary = await this.repoModel.getSummary(this.workspaceRoot, typeof args.task === "string" ? args.task : undefined);
            return ok(toolCall, "Loaded the current repo model summary with repo search guidance.", {
                ...summary,
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
                ...result,
                recommendedNextTool: result.symbols.length ? "repo_find_references" : "search_workspace",
                repoSearchGuidance: buildRepoSearchGuidance("symbols"),
            });
        }
        if (toolCall.name === "repo_find_references") {
            const symbol = compactWhitespace(args.symbol);
            if (!symbol)
                return fail(toolCall, "repo_find_references requires symbol.");
            const result = await this.repoModel.findReferences(this.workspaceRoot, {
                symbol,
                limit: clamp(Number(args.limit || 20), 1, 80),
            });
            return ok(toolCall, result.references.length
                ? `Found ${result.references.length} reference(s) for ${symbol} via ${formatRepoEngine(result.engine)}.`
                : `No references were found for ${symbol}; ${formatRepoEngine(result.engine)} did not surface any matches.`, {
                ...result,
                recommendedNextTool: result.references.length ? "repo_get_change_impact" : "search_workspace",
                repoSearchGuidance: buildRepoSearchGuidance("references"),
            });
        }
        if (toolCall.name === "repo_get_change_impact") {
            const result = await this.repoModel.getChangeImpact(this.workspaceRoot, {
                path: typeof args.path === "string" ? args.path : undefined,
                symbol: typeof args.symbol === "string" ? args.symbol : undefined,
                limit: clamp(Number(args.limit || 12), 1, 60),
            });
            return ok(toolCall, `Calculated change impact for ${result.subject}.`, result);
        }
        if (toolCall.name === "repo_get_validation_plan") {
            const result = await this.repoModel.getValidationPlan(this.workspaceRoot, {
                paths: Array.isArray(args.paths) ? args.paths.map((item) => String(item)) : undefined,
            });
            return ok(toolCall, result.primaryCommand
                ? `Loaded repo validation plan with primary command ${result.primaryCommand}.`
                : "Loaded repo validation plan without a canonical command.", result);
        }
        if (toolCall.name === "repo_record_verification") {
            const label = compactWhitespace(args.label);
            if (!label)
                return fail(toolCall, "repo_record_verification requires label.");
            const status = args.status === "running" || args.status === "passed" || args.status === "failed" ? args.status : "pending";
            const receipt = await this.repoModel.recordVerification(this.workspaceRoot, {
                label,
                summary: compactWhitespace(args.summary || label || "Recorded verification result"),
                status,
                command: typeof args.command === "string" ? args.command : undefined,
                failureCategory: typeof args.failureCategory === "string" ? args.failureCategory : undefined,
                targetHint: typeof args.targetHint === "string" ? args.targetHint : undefined,
            });
            return ok(toolCall, receipt.summary, receipt);
        }
        return fail(toolCall, `Unknown repo-model tool ${toolCall.name}.`);
    }
}
