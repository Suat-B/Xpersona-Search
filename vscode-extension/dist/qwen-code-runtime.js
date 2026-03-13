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
function extractToolSummary(blocks) {
    return blocks
        .filter((block) => block.type === "tool_use")
        .map((block) => {
        const inputPreview = block.input && typeof block.input === "object" ? trimToSentence(JSON.stringify(block.input)) : "";
        return inputPreview ? `Qwen tool: ${block.name} ${inputPreview}` : `Qwen tool: ${block.name}`;
    });
}
function summarizeToolRequest(toolName, input) {
    const commandLike = (typeof input.command === "string" && input.command) ||
        (typeof input.cmd === "string" && input.cmd) ||
        (typeof input.path === "string" && input.path) ||
        "";
    const detail = commandLike ? commandLike : trimToSentence(JSON.stringify(input));
    return detail ? `${toolName}: ${detail}` : toolName;
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
        const requestedSessionId = input.sessionId || undefined;
        let assistantText = "";
        let partialText = "";
        const permissionDenials = [];
        const result = (0, sdk_1.query)({
            prompt: input.prompt,
            options: {
                cwd,
                model: (0, config_1.getQwenModel)(),
                ...((0, config_1.getQwenExecutablePath)() ? { pathToQwenExecutable: (0, config_1.getQwenExecutablePath)() } : {}),
                authType: "openai",
                permissionMode: toPermissionMode(input.mode),
                allowedTools: (0, qwen_runtime_utils_1.getAutoApprovedQwenTools)(),
                includePartialMessages: true,
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
                        input.onActivity?.(`Qwen tool auto-approved: ${summarizeToolRequest(toolName, toolInput)}`);
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    const approved = await vscode.window.showWarningMessage(`Qwen Code wants to use a tool.\n\n${summarizeToolRequest(toolName, toolInput)}`, { modal: true }, "Allow Once", "Deny");
                    if (approved === "Allow Once") {
                        return { behavior: "allow", updatedInput: toolInput };
                    }
                    return { behavior: "deny", message: "Tool use denied in Playground." };
                },
            },
        });
        try {
            for await (const message of result) {
                if ((0, sdk_1.isSDKPartialAssistantMessage)(message)) {
                    if (message.event.type === "content_block_delta" &&
                        message.event.delta.type === "text_delta") {
                        partialText += message.event.delta.text;
                        input.onPartial?.(partialText.trim());
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
                        assistantText = nextText;
                        input.onPartial?.(assistantText);
                    }
                    for (const summary of extractToolSummary(message.message.content)) {
                        input.onActivity?.(summary);
                    }
                    continue;
                }
                if ((0, sdk_1.isSDKResultMessage)(message)) {
                    if (message.result && typeof message.result === "string" && message.result.trim()) {
                        assistantText = message.result.trim();
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
            assistantText: assistantText || partialText.trim() || "Qwen Code finished without returning a final message.",
            permissionDenials,
        };
    }
}
exports.QwenCodeRuntime = QwenCodeRuntime;
//# sourceMappingURL=qwen-code-runtime.js.map