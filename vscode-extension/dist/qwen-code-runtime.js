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
const config_1 = require("./config");
const qwen_runtime_utils_1 = require("./qwen-runtime-utils");
const qwen_response_assembly_1 = require("./qwen-response-assembly");
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
class QwenCodeRuntime {
    async runPrompt(input) {
        const cwd = (0, config_1.getWorkspaceRootPath)();
        if (!cwd) {
            throw new Error("Open a workspace folder before using Qwen Code.");
        }
        const model = (0, config_1.getQwenModel)();
        const includePartialMessages = true;
        const requestedSessionId = input.sessionId || undefined;
        let assistantText = "";
        let streamingMessageText = "";
        const permissionDenials = [];
        const usedToolNames = new Set();
        const approvedToolRequests = new Set();
        let didMutate = false;
        const publishAssistantText = (candidate) => {
            const merged = (0, qwen_response_assembly_1.mergeAssistantResponseText)(assistantText, candidate);
            if (!merged || merged === assistantText)
                return;
            assistantText = merged;
            input.onPartial?.(assistantText);
        };
        const result = (0, sdk_1.query)({
            prompt: input.prompt,
            options: {
                cwd,
                model,
                ...((0, config_1.getQwenExecutablePath)() ? { pathToQwenExecutable: (0, config_1.getQwenExecutablePath)() } : {}),
                authType: "openai",
                permissionMode: toPermissionMode(input.mode),
                allowedTools: (0, qwen_runtime_utils_1.getAutoApprovedQwenTools)(),
                includePartialMessages,
                env: {
                    OPENAI_API_KEY: input.apiKey,
                    OPENAI_BASE_URL: (0, config_1.getQwenOpenAiBaseUrl)(),
                    PLAYGROUND_BASE_API_URL: (0, config_1.getBaseApiUrl)(),
                },
                ...(requestedSessionId ? { resume: requestedSessionId } : {}),
                canUseTool: async (toolName, toolInput, options) => {
                    if (options.signal.aborted) {
                        return { behavior: "deny", message: "Request was aborted." };
                    }
                    if ((0, qwen_runtime_utils_1.isSafeInspectionToolRequest)(toolName, toolInput)) {
                        input.onActivity?.((0, qwen_runtime_utils_1.describeToolActivity)(toolName, toolInput));
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    const approvalKey = buildApprovalKey(toolName, toolInput);
                    if (approvedToolRequests.has(approvalKey)) {
                        input.onActivity?.(`Reusing prior approval: ${summarizeToolRequest(toolName, toolInput)}`);
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    input.onActivity?.("Awaiting tool approval");
                    const approved = await vscode.window.showWarningMessage(`Qwen Code wants to use a tool.\n\n${summarizeToolRequest(toolName, toolInput)}`, { modal: true }, "Allow Once", "Deny");
                    if (approved === "Allow Once") {
                        approvedToolRequests.add(approvalKey);
                        input.onActivity?.(`Approved tool: ${summarizeToolRequest(toolName, toolInput)}`);
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    input.onActivity?.(`Denied tool: ${summarizeToolRequest(toolName, toolInput)}`);
                    return { behavior: "deny", message: "Tool use denied in Playground." };
                },
            },
        });
        try {
            for await (const message of result) {
                if ((0, sdk_1.isSDKPartialAssistantMessage)(message)) {
                    if (message.event.type === "message_start") {
                        streamingMessageText = "";
                        continue;
                    }
                    if (message.event.type === "content_block_delta" &&
                        message.event.delta.type === "text_delta") {
                        streamingMessageText += message.event.delta.text;
                        publishAssistantText(streamingMessageText);
                        continue;
                    }
                    if (message.event.type === "message_stop") {
                        publishAssistantText(streamingMessageText);
                        streamingMessageText = "";
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
                    if (nextText) {
                        publishAssistantText(nextText);
                    }
                    for (const toolUse of extractToolUses(message.message.content)) {
                        usedToolNames.add(toolUse.name);
                        if ((0, qwen_runtime_utils_1.isMutationToolName)(toolUse.name)) {
                            didMutate = true;
                        }
                        input.onActivity?.((0, qwen_runtime_utils_1.describeToolActivity)(toolUse.name, toolUse.input));
                    }
                    continue;
                }
                if ((0, sdk_1.isSDKResultMessage)(message)) {
                    if (message.result && typeof message.result === "string" && message.result.trim()) {
                        publishAssistantText(message.result);
                    }
                    for (const denial of message.permission_denials || []) {
                        permissionDenials.push(trimToSentence(`${denial.tool_name} denied`));
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
                streamingMessageText.trim() ||
                "Qwen Code finished without returning a final message.",
            permissionDenials,
            usedTools: Array.from(usedToolNames),
            didMutate,
        };
    }
}
exports.QwenCodeRuntime = QwenCodeRuntime;
//# sourceMappingURL=qwen-code-runtime.js.map