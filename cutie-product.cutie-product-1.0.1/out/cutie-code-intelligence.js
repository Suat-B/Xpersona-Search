"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSemanticQueries = buildSemanticQueries;
exports.buildCodeTaskFrame = buildCodeTaskFrame;
exports.summarizeTaskFrame = summarizeTaskFrame;
exports.buildTargetCandidates = buildTargetCandidates;
exports.summarizeTargetCandidates = summarizeTargetCandidates;
exports.analyzeTargetContent = analyzeTargetContent;
exports.refineTaskFrameFromTargetContent = refineTaskFrameFromTargetContent;
exports.buildEntityPresenceProbeCommand = buildEntityPresenceProbeCommand;
exports.buildNoOpConclusion = buildNoOpConclusion;
exports.inferNoOpConclusionFromCommandResult = inferNoOpConclusionFromCommandResult;
exports.mapRetryStrategyToRepairTactic = mapRetryStrategyToRepairTactic;
exports.synthesizeDeterministicRewriteFromTargetContent = synthesizeDeterministicRewriteFromTargetContent;
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
function normalizeIdentifierLabel(label) {
    return String(label || "")
        .toLowerCase()
        .replace(/[`"'.,:;!?()[\]{}]/g, " ")
        .replace(/\b(?:the|a|an|this|that|these|those|my|our|your)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function toIdentifierCandidate(label) {
    return normalizeIdentifierLabel(label)
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}
function extractActionScopedEntityLabel(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    const scopedMatch = /\b(?:remove|rmove|delete|delte|drop|unset|strip|eliminate|rename|replace|change|update|modify|fix)\b\s+(.+)$/.exec(normalized) ||
        /\b(?:add|create|implement|insert|append|introduce)\b\s+(.+)$/.exec(normalized);
    const scoped = scopedMatch?.[1] || normalized;
    return normalizeIdentifierLabel(scoped
        .replace(/\b(?:in|from|on)\s+(?:this file|the current file|the active file|this strategy|this script)\b.*$/g, " ")
        .replace(/\b(?:please|for me|right now|now)\b/g, " "));
}
function normalizeAction(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (/\b(remove|rmove|delete|delte|drop|unset|strip|eliminate)\b/.test(normalized))
        return "remove";
    if (/\b(verify|check|confirm|test|validate)\b/.test(normalized))
        return "verify";
    if (/\b(add|create|implement|insert|append|introduce)\b/.test(normalized))
        return "add";
    return "update";
}
function normalizeEntity(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (/\b(tra(?:i)?ling stop loss|tra(?:i)?ling stop|trail stop|trail(?:ing)?[_ -]?stop)\b/.test(normalized)) {
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
    const fallback = extractActionScopedEntityLabel(prompt);
    const words = fallback
        .split(" ")
        .filter((word) => word.length > 2)
        .slice(0, 5);
    const label = words.length ? words.join(" ") : "requested change";
    return { entity: toIdentifierCandidate(label) || "requested_change", entityLabel: label };
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
            return ["take_profit", "takeProfit", "limit=", "profit="];
        case "strategy_exit":
            return ["strategy.exit", "stop=", "limit=", "profit="];
        default: {
            const spacedEntity = normalizeIdentifierLabel(taskFrame.entity.replace(/_/g, " "));
            const underscoredLabel = toIdentifierCandidate(taskFrame.entityLabel);
            const tokens = taskFrame.entityLabel
                .split(/\s+/)
                .map((part) => part.trim())
                .filter((part) => part.length > 2);
            return dedupeStrings([taskFrame.entity, spacedEntity, underscoredLabel, taskFrame.entityLabel, ...tokens]).slice(0, 6);
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
function refineTaskFrameFromTargetContent(input) {
    const normalizedLabel = normalizeIdentifierLabel(input.taskFrame.entityLabel);
    const normalizedEntity = normalizeIdentifierLabel(input.taskFrame.entity.replace(/_/g, " "));
    if (!normalizedLabel && !normalizedEntity)
        return input.taskFrame;
    const identifierMatches = String(input.content || "").match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    const uniqueIdentifiers = Array.from(new Set(identifierMatches));
    const targetNeedle = normalizedEntity || normalizedLabel;
    const best = uniqueIdentifiers.find((identifier) => normalizeIdentifierLabel(identifier.replace(/_/g, " ")) === targetNeedle);
    if (!best)
        return input.taskFrame;
    const entityLabel = best.replace(/_/g, " ");
    if (best === input.taskFrame.entity &&
        entityLabel === input.taskFrame.entityLabel &&
        input.taskFrame.confidence !== "low") {
        return input.taskFrame;
    }
    return {
        ...input.taskFrame,
        entity: best,
        entityLabel,
        confidence: input.taskFrame.confidence === "low" ? "high" : input.taskFrame.confidence,
        evidence: dedupeStrings([...input.taskFrame.evidence, `refinedEntity:${best}`]),
        semanticQueries: buildSemanticQueries({
            entity: best,
            entityLabel,
        }),
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
function detectPreferredNewline(content) {
    return content.includes("\r\n") ? "\r\n" : "\n";
}
function isPineStrategyContent(content) {
    return /\/\/@version=\d+/i.test(content) && /\bstrategy\s*\(/.test(content);
}
function buildPineTrailingStopRewrite(content) {
    if (!isPineStrategyContent(content))
        return null;
    if (!/strategy\.entry\s*\(/.test(content))
        return null;
    if (/strategy\.exit\s*\(/.test(content))
        return null;
    if (/\btrail_points\s*=/.test(content) || /\btrail_offset\s*=/.test(content))
        return null;
    const newline = detectPreferredNewline(content);
    const lines = String(content || "").split(/\r?\n/);
    const inputAnchor = lines.reduce((best, line, index) => {
        if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*input\./.test(line))
            return index;
        return best;
    }, -1);
    if (inputAnchor < 0)
        return null;
    const nextLines = [...lines];
    nextLines.splice(inputAnchor + 1, 0, "// Trailing stop distance in price points.", 'trail_points = input.float(0.5, "Trailing Stop Distance (points)", minval=0.0)');
    const insertions = [];
    nextLines.forEach((line, index) => {
        const indent = (line.match(/^\s*/) || [""])[0];
        if (/strategy\.entry\(\s*"Long"/.test(line)) {
            insertions.push({
                index: index + 1,
                line: `${indent}strategy.exit("LongTrail", from_entry="Long", trail_points=trail_points, trail_offset=trail_points)`,
            });
        }
        if (/strategy\.entry\(\s*"Short"/.test(line)) {
            insertions.push({
                index: index + 1,
                line: `${indent}strategy.exit("ShortTrail", from_entry="Short", trail_points=trail_points, trail_offset=trail_points)`,
            });
        }
    });
    if (!insertions.length)
        return null;
    insertions
        .sort((a, b) => b.index - a.index)
        .forEach((row) => {
        nextLines.splice(row.index, 0, row.line);
    });
    const rewritten = nextLines.join(newline);
    if (rewritten === content)
        return null;
    return {
        content: rewritten,
        summary: "Synthesized Pine trailing stop rewrite from the inspected strategy entries.",
        strategy: "pine_trailing_stop_rewrite",
    };
}
function appendArgumentToSingleLineCall(line, argument) {
    const closeIndex = line.lastIndexOf(")");
    if (closeIndex < 0)
        return line;
    const prefix = line.slice(0, closeIndex).trimEnd();
    return `${prefix}, ${argument}${line.slice(closeIndex)}`;
}
function buildPineTakeProfitRewrite(content) {
    if (!isPineStrategyContent(content))
        return null;
    if (!/strategy\.entry\s*\(/.test(content))
        return null;
    if (/\btake_profit_points\s*=/.test(content))
        return null;
    if (/\blimit\s*=\s*strategy\.position_avg_price\s*[+-]\s*take_profit_points/.test(content))
        return null;
    const newline = detectPreferredNewline(content);
    const lines = String(content || "").split(/\r?\n/);
    const inputAnchor = lines.reduce((best, line, index) => {
        if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*input\./.test(line))
            return index;
        return best;
    }, -1);
    if (inputAnchor < 0)
        return null;
    const nextLines = [...lines];
    nextLines.splice(inputAnchor + 1, 0, "// Take profit distance in price points.", 'take_profit_points = input.float(1.0, "Take Profit Distance (points)", minval=0.0)');
    let longExitFound = false;
    let shortExitFound = false;
    nextLines.forEach((line, index) => {
        if (!/strategy\.exit\(/.test(line) || /\blimit\s*=/.test(line))
            return;
        if (/from_entry\s*=\s*"Long"/.test(line)) {
            nextLines[index] = appendArgumentToSingleLineCall(line, "limit=strategy.position_avg_price + take_profit_points");
            longExitFound = true;
        }
        else if (/from_entry\s*=\s*"Short"/.test(line)) {
            nextLines[index] = appendArgumentToSingleLineCall(line, "limit=strategy.position_avg_price - take_profit_points");
            shortExitFound = true;
        }
    });
    const insertions = [];
    nextLines.forEach((line, index) => {
        const indent = (line.match(/^\s*/) || [""])[0];
        if (!longExitFound && /strategy\.entry\(\s*"Long"/.test(line)) {
            insertions.push({
                index: index + 1,
                line: `${indent}strategy.exit("LongTakeProfit", from_entry="Long", limit=strategy.position_avg_price + take_profit_points)`,
            });
            longExitFound = true;
        }
        if (!shortExitFound && /strategy\.entry\(\s*"Short"/.test(line)) {
            insertions.push({
                index: index + 1,
                line: `${indent}strategy.exit("ShortTakeProfit", from_entry="Short", limit=strategy.position_avg_price - take_profit_points)`,
            });
            shortExitFound = true;
        }
    });
    if (!longExitFound && !shortExitFound && !insertions.length)
        return null;
    insertions
        .sort((a, b) => b.index - a.index)
        .forEach((row) => {
        nextLines.splice(row.index, 0, row.line);
    });
    const rewritten = nextLines.join(newline);
    if (rewritten === content)
        return null;
    return {
        content: rewritten,
        summary: "Synthesized Pine take profit rewrite from the inspected strategy exits.",
        strategy: "pine_take_profit_rewrite",
    };
}
function synthesizeDeterministicRewriteFromTargetContent(input) {
    if (input.taskFrame.action !== "add")
        return null;
    if (["stop_loss", "trailing_stop_loss"].includes(input.taskFrame.entity)) {
        return buildPineTrailingStopRewrite(input.content);
    }
    if (input.taskFrame.entity === "take_profit") {
        return buildPineTakeProfitRewrite(input.content);
    }
    return null;
}
//# sourceMappingURL=cutie-code-intelligence.js.map