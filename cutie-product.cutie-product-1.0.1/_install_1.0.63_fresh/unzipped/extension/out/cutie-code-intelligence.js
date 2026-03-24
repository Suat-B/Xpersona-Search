"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSemanticQueries = buildSemanticQueries;
exports.buildCodeTaskFrame = buildCodeTaskFrame;
exports.summarizeTaskFrame = summarizeTaskFrame;
exports.buildTargetCandidates = buildTargetCandidates;
exports.summarizeTargetCandidates = summarizeTargetCandidates;
exports.analyzeTargetContent = analyzeTargetContent;
exports.buildEntityPresenceProbeCommand = buildEntityPresenceProbeCommand;
exports.buildNoOpConclusion = buildNoOpConclusion;
exports.inferNoOpConclusionFromCommandResult = inferNoOpConclusionFromCommandResult;
exports.mapRetryStrategyToRepairTactic = mapRetryStrategyToRepairTactic;
const cutie_policy_1 = require("./cutie-policy");
function stripMentionTokens(prompt) {
    return String(prompt || "")
        .replace(/@window:"[^"]+"/gi, " ")
        .replace(/@"[^"]+"/g, " ")
        .replace(/@window:[^\s]+/gi, " ")
        .replace(/@[A-Za-z0-9_./:-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function dedupeStrings(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const normalized = String(value || "").trim();
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}
function normalizeAction(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (/\b(remove|delete|drop|unset|strip|eliminate)\b/.test(normalized))
        return "remove";
    if (/\b(verify|check|confirm|test|validate)\b/.test(normalized))
        return "verify";
    if (/\b(add|create|implement|insert|append|introduce)\b/.test(normalized))
        return "add";
    return "update";
}
function normalizeEntity(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (/\b(trailing stop loss|trailing stop|trail stop|trail(?:ing)?[_ -]?stop)\b/.test(normalized)) {
        return { entity: "trailing_stop_loss", entityLabel: "trailing stop loss" };
    }
    if (/\b(stop loss|stoploss|stop-loss)\b/.test(normalized)) {
        return { entity: "stop_loss", entityLabel: "stop loss" };
    }
    if (/\b(take profit|take-profit|takeprofit|profit target|tp\d*)\b/.test(normalized)) {
        return { entity: "take_profit", entityLabel: "take profit" };
    }
    if (/\b(exit strategy|strategy exit|strategy\.exit)\b/.test(normalized)) {
        return { entity: "strategy_exit", entityLabel: "strategy exit" };
    }
    const fallback = normalized
        .replace(/\b(?:please|could you|can you|would you|in this file|this file|current file|active file)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const words = fallback
        .split(" ")
        .filter((word) => word.length > 2)
        .slice(0, 4);
    const label = words.length ? words.join(" ") : "requested change";
    return { entity: label.replace(/\s+/g, "_"), entityLabel: label };
}
function resolveTargetMode(input) {
    if (input.mentionedPaths.length > 0)
        return "mentioned";
    if (/\b(this file|current file|active file|open file|in this file|here in this file|this strategy|this script)\b/i.test(input.prompt)) {
        return input.preferredTargetPath ? "implied_current_file" : "unknown";
    }
    return input.preferredTargetPath ? "inferred_candidate" : "unknown";
}
function resolveTaskConfidence(input) {
    if (input.targetMode === "mentioned")
        return "high";
    if (input.targetConfidence === "trusted" && input.preferredTargetPath)
        return "high";
    if (input.preferredTargetPath)
        return "medium";
    return "low";
}
function buildSemanticQueries(taskFrame) {
    switch (taskFrame.entity) {
        case "trailing_stop_loss":
            return ["trail_offset", "trail_points", "trail_price", "trailing stop", "strategy.exit", "trail"];
        case "stop_loss":
            return ["stop_loss", "stopLoss", "stop=", "loss=", "strategy.exit"];
        case "take_profit":
            return ["take_profit", "takeProfit", "limit=", "profit=", "strategy.exit"];
        case "strategy_exit":
            return ["strategy.exit", "stop=", "limit=", "profit="];
        default: {
            const tokens = taskFrame.entityLabel
                .split(/\s+/)
                .map((part) => part.trim())
                .filter((part) => part.length > 2);
            return dedupeStrings(tokens).slice(0, 5);
        }
    }
}
function buildCodeTaskFrame(input) {
    const action = normalizeAction(input.prompt);
    const entity = normalizeEntity(input.prompt);
    const targetMode = resolveTargetMode(input);
    const confidence = resolveTaskConfidence({
        targetMode,
        preferredTargetPath: input.preferredTargetPath,
        targetConfidence: input.targetConfidence,
    });
    const evidence = [
        `action:${action}`,
        `entity:${entity.entityLabel}`,
        `targetMode:${targetMode}`,
        input.preferredTargetPath ? `target:${input.preferredTargetPath}` : "target:unknown",
    ];
    return {
        action,
        entity: entity.entity,
        entityLabel: entity.entityLabel,
        targetMode,
        confidence,
        evidence,
        semanticQueries: buildSemanticQueries({
            entity: entity.entity,
            entityLabel: entity.entityLabel,
        }),
    };
}
function summarizeTaskFrame(taskFrame) {
    if (!taskFrame)
        return undefined;
    const target = taskFrame.targetMode === "mentioned"
        ? "mentioned target"
        : taskFrame.targetMode === "implied_current_file"
            ? "current file"
            : taskFrame.targetMode === "inferred_candidate"
                ? "inferred target"
                : "unknown target";
    return `${taskFrame.action} ${taskFrame.entityLabel} on ${target} (${taskFrame.confidence} confidence)`;
}
function buildTargetCandidates(input) {
    const out = [];
    const push = (pathValue, source, confidence, note) => {
        const path = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(pathValue || null);
        if (!path || out.some((candidate) => candidate.path === path))
            return;
        out.push({
            path,
            source,
            confidence,
            ...(note ? { note } : {}),
        });
    };
    push(input.preferredTargetPath, input.preferredTargetSource || "none", input.preferredTargetConfidence || "none");
    push(input.activeFilePath, "active_file", "trusted", "Focused editor context");
    for (const filePath of input.openFilePaths || []) {
        push(filePath, "visible_editor", "trusted", "Visible editor candidate");
    }
    push(input.latestRuntimePath, "latest_runtime_state", "untrusted", "Recent runtime target");
    return out.slice(0, 6);
}
function summarizeTargetCandidates(candidates, preferredTargetPath) {
    if (preferredTargetPath) {
        const hit = (candidates || []).find((candidate) => candidate.path === preferredTargetPath);
        if (hit)
            return `${preferredTargetPath} via ${hit.source} (${hit.confidence})`;
        return preferredTargetPath;
    }
    if (!candidates?.length)
        return undefined;
    return candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.path} (${candidate.source})`)
        .join(", ");
}
function analyzeTargetContent(input) {
    const queries = input.taskFrame.semanticQueries || [];
    const lines = String(input.content || "").split(/\r?\n/);
    const matches = [];
    const normalizedQueries = queries.map((query) => query.toLowerCase());
    lines.forEach((line, index) => {
        const lowered = line.toLowerCase();
        normalizedQueries.forEach((query, queryIndex) => {
            if (!query || !lowered.includes(query))
                return;
            if (matches.some((match) => match.lineNumber === index + 1 && match.query === queries[queryIndex]))
                return;
            matches.push({
                query: queries[queryIndex],
                lineNumber: index + 1,
                line: line.trim(),
            });
        });
    });
    const found = matches.length > 0;
    const confidentAbsent = !found && queries.length > 0;
    const summary = found
        ? `Found ${input.taskFrame.entityLabel} evidence at ${matches
            .slice(0, 3)
            .map((match) => `line ${match.lineNumber}`)
            .join(", ")}.`
        : `No ${input.taskFrame.entityLabel} evidence was found in the inspected target file.`;
    return {
        found,
        confidentAbsent,
        matches: matches.slice(0, 8),
        summary,
    };
}
function escapePowerShellSingleQuoted(value) {
    return String(value || "").replace(/'/g, "''");
}
function buildEntityPresenceProbeCommand(targetPath, queries) {
    const escapedPath = escapePowerShellSingleQuoted(targetPath);
    const patterns = dedupeStrings(queries)
        .slice(0, 8)
        .map((query) => `'${escapePowerShellSingleQuoted(query)}'`)
        .join(", ");
    return [
        `$patterns = @(${patterns});`,
        `$matches = Select-String -Path '${escapedPath}' -Pattern $patterns -SimpleMatch;`,
        `if ($matches) {`,
        `  $matches | Select-Object -First 20 Path, LineNumber, Line | Format-Table -HideTableHeaders | Out-String -Width 220`,
        `} else {`,
        `  Write-Output 'CUTIE_ENTITY_NOT_FOUND'`,
        `}`,
    ].join(" ");
}
function buildNoOpConclusion(input) {
    if (!input.taskFrame || input.taskFrame.action !== "remove")
        return null;
    const targetLabel = input.preferredTargetPath || "the target file";
    return `Verified that ${input.taskFrame.entityLabel} is not present in ${targetLabel}, so no file change was needed.`;
}
function inferNoOpConclusionFromCommandResult(input) {
    const command = String(input.command || "");
    const stdout = String(input.stdout || "");
    if (!command.includes("CUTIE_ENTITY_NOT_FOUND"))
        return null;
    if (!stdout.includes("CUTIE_ENTITY_NOT_FOUND"))
        return null;
    return buildNoOpConclusion({
        taskFrame: input.taskFrame,
        preferredTargetPath: input.preferredTargetPath,
    });
}
function mapRetryStrategyToRepairTactic(strategy) {
    switch (strategy) {
        case "force_mutation":
        case "alternate_mutation":
            return "patch_mutation";
        case "command_repair":
        case "refresh_state":
            return "command_assisted_repair";
        case "full_rewrite":
            return "full_rewrite";
        case "verification_repair":
            return "verification";
        default:
            return undefined;
    }
}
//# sourceMappingURL=cutie-code-intelligence.js.map