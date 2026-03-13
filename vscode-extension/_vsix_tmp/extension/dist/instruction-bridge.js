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
exports.loadInstructionBridge = loadInstructionBridge;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8");
    }
    catch {
        return "";
    }
}
function summarizeSkill(skillPath, body) {
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const title = lines.find((line) => /^#/.test(line))?.replace(/^#+\s*/, "").trim() ||
        path.basename(path.dirname(skillPath));
    const description = lines.find((line) => !/^#/.test(line)) ||
        "Workspace skill";
    return {
        name: title.slice(0, 80),
        description: description.slice(0, 240),
        source: "skill",
        path: skillPath,
    };
}
async function loadInstructionBridge(workspaceRoot) {
    const root = workspaceRoot ? path.resolve(workspaceRoot) : "";
    const agentsPath = root ? path.join(root, "AGENTS.md") : "";
    const hasAgentsFile = Boolean(root && fs.existsSync(agentsPath));
    const agentsText = hasAgentsFile ? safeReadFile(agentsPath) : "";
    const skillPaths = [];
    const actions = [];
    if (root) {
        const skillsRoot = path.join(root, "skills");
        if (fs.existsSync(skillsRoot)) {
            const stack = [skillsRoot];
            while (stack.length > 0) {
                const current = stack.pop();
                let entries = [];
                try {
                    entries = fs.readdirSync(current, { withFileTypes: true });
                }
                catch {
                    entries = [];
                }
                for (const entry of entries) {
                    const nextPath = path.join(current, entry.name);
                    if (entry.isDirectory()) {
                        stack.push(nextPath);
                        continue;
                    }
                    if (!/SKILL\.md$/i.test(entry.name))
                        continue;
                    skillPaths.push(nextPath);
                    const body = safeReadFile(nextPath);
                    actions.push(summarizeSkill(nextPath, body));
                }
            }
        }
    }
    const promptSections = [
        hasAgentsFile
            ? `Workspace AGENTS.md:\n${agentsText.slice(0, 12000)}`
            : "Workspace AGENTS.md is not present. Fall back to local skills and explicit repo context.",
        actions.length > 0
            ? `Local skills:\n${actions.map((action) => `- ${action.name}: ${action.description}`).join("\n")}`
            : "Local skills: none detected under skills/**/SKILL.md",
    ];
    if (hasAgentsFile) {
        actions.unshift({
            name: "Workspace AGENTS",
            description: "Primary workspace instruction source loaded from AGENTS.md.",
            source: "agents_md",
            path: agentsPath,
        });
    }
    return {
        generatedAt: new Date().toISOString(),
        hasAgentsFile,
        ...(hasAgentsFile ? { agentsPath } : {}),
        prompt: promptSections.join("\n\n").slice(0, 20000),
        actions,
        skillPaths,
    };
}
//# sourceMappingURL=instruction-bridge.js.map