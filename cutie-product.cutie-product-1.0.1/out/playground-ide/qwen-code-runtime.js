"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QwenCodeRuntime = void 0;
const vscode = __importStar(require("vscode"));
const sdk_1 = require("@qwen-code/sdk");
const pg_config_1 = require("./pg-config");
const qwen_runtime_utils_1 = require("./qwen-runtime-utils");
const qwen_response_assembly_1 = require("./qwen-response-assembly");
const qwen_stream_format_1 = require("./qwen-stream-format");
function trimToSentence(value, limit = 220) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= limit)
        return text;
    return `${text.slice(0, limit - 1)}...`;
}
function extractText(blocks) {
    return blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
}
function extractThinking(blocks) {
    return blocks
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking)
        .join("")
        .trim();
}
function extractToolUses(blocks) {
    return blocks
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
        name: block.name,
        input: (block.input || {}),
    }));
}
function summarizeToolRequest(toolName, input) {
    const commandLike = (typeof input.command === "string" && input.command) ||
        (typeof input.cmd === "string" && input.cmd) ||
        (typeof input.path === "string" && input.path) ||
        "";
    const detail = commandLike ? commandLike : trimToSentence(JSON.stringify(input));
    return detail ? `${toolName}: ${detail}` : toolName;
}
function buildApprovalKey(toolName, input) {
    return JSON.stringify({
        toolName: String(toolName || "").trim().toLowerCase(),
        command: (typeof input.command === "string" && input.command.trim()) ||
            (typeof input.cmd === "string" && input.cmd.trim()) ||
            (typeof input.path === "string" && input.path.trim()) ||
            "",
        args: input && typeof input === "object"
            ? Object.keys(input)
                .sort()
                .map((key) => [key, input[key]])
            : [],
    });
}
function toPermissionMode(mode) {
    return mode === "plan" ? "plan" : "auto-edit";
}
function extractPseudoToolMarkupEvents(text) {
    const source = String(text || "");
    if (!source)
        return [];
    const toolCallMatches = Array.from(source.matchAll(/<tool_call>[\s\S]*?<function=([A-Za-z0-9_.:-]+)>[\s\S]*?<\/tool_call>/gi));
    if (!toolCallMatches.length)
        return [];
    return toolCallMatches.map((match) => {
        const toolName = String(match[1] || "unknown_tool").trim() || "unknown_tool";
        const snippet = String(match[0] || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 220);
        return {
            toolName,
            summary: snippet ? `${toolName}: ${snippet}` : toolName,
        };
    });
}
class QwenCodeRuntime {
    async runPrompt(input) {
        const cwd = (0, pg_config_1.getWorkspaceRootPath)();
        if (!cwd) {
            throw new Error("Open a workspace folder before using Qwen Code.");
        }
        const model = (0, pg_config_1.getQwenModel)();
        const includePartialMessages = true;
        const requestedSessionId = input.sessionId || undefined;
        let assistantText = "";
        let completedReasoningText = "";
        let completedAnswerText = "";
        let streamingReasoningText = "";
        let streamingAnswerText = "";
        const permissionDenials = [];
        const usedToolNames = new Set();
        const approvedToolRequests = new Set();
        const toolEvents = [];
        let didMutate = false;
        const pushToolEvent = (phase, toolName, input, detail) => {
            const summary = summarizeToolRequest(toolName, input || {});
            toolEvents.push({
                phase,
                toolName,
                summary,
                detail: detail ? trimToSentence(detail) : undefined,
                timestamp: new Date().toISOString(),
            });
        };
        const publishAssistantText = (reasoningCandidate, answerCandidate) => {
            const nextText = (0, qwen_stream_format_1.formatAssistantStreamText)({
                reasoningText: reasoningCandidate,
                answerText: answerCandidate,
            });
            if (!nextText || nextText === assistantText)
                return;
            assistantText = nextText;
            input.onPartial?.(nextText);
        };
        const publishStreamingState = () => {
            publishAssistantText((0, qwen_response_assembly_1.mergeAssistantResponseText)(completedReasoningText, streamingReasoningText), (0, qwen_response_assembly_1.mergeAssistantResponseText)(completedAnswerText, streamingAnswerText));
        };
        const commitAssistantText = (reasoningCandidate, answerCandidate) => {
            const nextReasoning = (0, qwen_response_assembly_1.mergeAssistantResponseText)(completedReasoningText, reasoningCandidate);
            const nextAnswer = (0, qwen_response_assembly_1.mergeAssistantResponseText)(completedAnswerText, answerCandidate);
            const didChange = nextReasoning !== completedReasoningText || nextAnswer !== completedAnswerText;
            completedReasoningText = nextReasoning;
            completedAnswerText = nextAnswer;
            if (!didChange)
                return;
            publishAssistantText(completedReasoningText, completedAnswerText);
        };
        const result = (0, sdk_1.query)({
            prompt: input.prompt,
            options: {
                cwd,
                model,
                ...((0, pg_config_1.getQwenExecutablePath)()
                    ? { pathToQwenExecutable: (0, pg_config_1.getQwenExecutablePath)() }
                    : (0, pg_config_1.getQwenCliWrapperEnabled)() && (0, pg_config_1.getQwenCliWrapperPath)()
                        ? { pathToQwenExecutable: (0, pg_config_1.getQwenCliWrapperPath)() }
                        : {}),
                authType: "openai",
                permissionMode: toPermissionMode(input.mode),
                allowedTools: (0, qwen_runtime_utils_1.getAutoApprovedQwenTools)(),
                includePartialMessages,
                ...(input.abortController ? { abortController: input.abortController } : {}),
                env: {
                    OPENAI_API_KEY: input.apiKey,
                    OPENAI_BASE_URL: (0, pg_config_1.getQwenOpenAiBaseUrl)(),
                    PLAYGROUND_BASE_API_URL: (0, pg_config_1.getBaseApiUrl)(),
                },
                ...(requestedSessionId ? { resume: requestedSessionId } : {}),
                canUseTool: async (toolName, toolInput, options) => {
                    if (options.signal.aborted) {
                        return { behavior: "deny", message: "Request was aborted." };
                    }
                    pushToolEvent("requested", toolName, toolInput);
                    if ((0, qwen_runtime_utils_1.isSafeInspectionToolRequest)(toolName, toolInput)) {
                        input.onActivity?.((0, qwen_runtime_utils_1.describeToolActivity)(toolName, toolInput));
                        pushToolEvent("approved", toolName, toolInput, "Auto-approved safe inspection tool.");
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    const approvalKey = buildApprovalKey(toolName, toolInput);
                    if (approvedToolRequests.has(approvalKey)) {
                        input.onActivity?.(`Reusing prior approval: ${summarizeToolRequest(toolName, toolInput)}`);
                        pushToolEvent("reused_approval", toolName, toolInput);
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    input.onActivity?.("Awaiting tool approval");
                    const approved = await vscode.window.showWarningMessage(`Qwen Code wants to use a tool.\n\n${summarizeToolRequest(toolName, toolInput)}`, { modal: true }, "Allow Once", "Deny");
                    if (approved === "Allow Once") {
                        approvedToolRequests.add(approvalKey);
                        input.onActivity?.(`Approved tool: ${summarizeToolRequest(toolName, toolInput)}`);
                        pushToolEvent("approved", toolName, toolInput, "Approved from modal prompt.");
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    input.onActivity?.(`Denied tool: ${summarizeToolRequest(toolName, toolInput)}`);
                    pushToolEvent("denied", toolName, toolInput, "Denied from modal prompt.");
                    return { behavior: "deny", message: "Tool use denied in Binary IDE." };
                },
            },
        });
        try {
            for await (const message of result) {
                if ((0, sdk_1.isSDKPartialAssistantMessage)(message)) {
                    if (message.event.type === "message_start") {
                        streamingReasoningText = "";
                        streamingAnswerText = "";
                        continue;
                    }
                    if (message.event.type === "content_block_delta" &&
                        message.event.delta.type === "text_delta") {
                        streamingAnswerText += message.event.delta.text;
                        publishStreamingState();
                        continue;
                    }
                    if (message.event.type === "content_block_delta" &&
                        message.event.delta.type === "thinking_delta") {
                        streamingReasoningText += message.event.delta.thinking;
                        publishStreamingState();
                        continue;
                    }
                    if (message.event.type === "message_stop") {
                        commitAssistantText(streamingReasoningText, streamingAnswerText);
                        streamingReasoningText = "";
                        streamingAnswerText = "";
                    }
                    continue;
                }
                if ((0, sdk_1.isSDKSystemMessage)(message)) {
                    if (message.subtype === "init" || message.subtype === "initialized") {
                        input.onActivity?.(`Qwen Code ready${message.model ? ` with ${message.model}` : ""}${message.permission_mode ? ` (${message.permission_mode})` : ""}.`);
                    }
                    continue;
                }
                if ((0, sdk_1.isSDKAssistantMessage)(message)) {
                    const nextText = extractText(message.message.content);
                    const nextThinking = extractThinking(message.message.content);
                    if (nextText || nextThinking) {
                        commitAssistantText(nextThinking, nextText);
                        for (const pseudoEvent of extractPseudoToolMarkupEvents(nextText)) {
                            toolEvents.push({
                                phase: "pseudo_markup",
                                toolName: pseudoEvent.toolName,
                                summary: pseudoEvent.summary,
                                detail: "Assistant emitted literal tool-call markup instead of executing an SDK tool.",
                                timestamp: new Date().toISOString(),
                            });
                        }
                    }
                    for (const toolUse of extractToolUses(message.message.content)) {
                        usedToolNames.add(toolUse.name);
                        if ((0, qwen_runtime_utils_1.isMutationToolName)(toolUse.name)) {
                            didMutate = true;
                        }
                        pushToolEvent("executed", toolUse.name, toolUse.input);
                        input.onActivity?.((0, qwen_runtime_utils_1.describeToolActivity)(toolUse.name, toolUse.input));
                    }
                    continue;
                }
                if ((0, sdk_1.isSDKResultMessage)(message)) {
                    if (message.result && typeof message.result === "string" && message.result.trim()) {
                        commitAssistantText("", message.result);
                    }
                    for (const denial of message.permission_denials || []) {
                        const denialSummary = trimToSentence(`${denial.tool_name} denied`);
                        permissionDenials.push(denialSummary);
                        pushToolEvent("permission_denial", denial.tool_name, {}, denialSummary);
                    }
                }
            }
        }
        finally {
            await result.close().catch(() => undefined);
        }
        return {
            sessionId: result.getSessionId(),
            assistantText: assistantText ||
                (0, qwen_stream_format_1.formatAssistantStreamText)({
                    reasoningText: (0, qwen_response_assembly_1.mergeAssistantResponseText)(completedReasoningText, streamingReasoningText),
                    answerText: (0, qwen_response_assembly_1.mergeAssistantResponseText)(completedAnswerText, streamingAnswerText),
                }) ||
                "Qwen Code finished without returning a final message.",
            permissionDenials,
            usedTools: Array.from(usedToolNames),
            didMutate,
            toolEvents,
        };
    }
}
exports.QwenCodeRuntime = QwenCodeRuntime;
//# sourceMappingURL=qwen-code-runtime.js.map