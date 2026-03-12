import * as fs from "fs";
import * as path from "path";

export type InstructionBridgeAction = {
  name: string;
  description: string;
  source: "agents_md" | "skill";
  path?: string;
};

export type InstructionBridgeSnapshot = {
  generatedAt: string;
  hasAgentsFile: boolean;
  agentsPath?: string;
  prompt: string;
  actions: InstructionBridgeAction[];
  skillPaths: string[];
};

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function summarizeSkill(skillPath: string, body: string): InstructionBridgeAction {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title =
    lines.find((line) => /^#/.test(line))?.replace(/^#+\s*/, "").trim() ||
    path.basename(path.dirname(skillPath));
  const description =
    lines.find((line) => !/^#/.test(line)) ||
    "Workspace skill";
  return {
    name: title.slice(0, 80),
    description: description.slice(0, 240),
    source: "skill",
    path: skillPath,
  };
}

export async function loadInstructionBridge(workspaceRoot: string | null | undefined): Promise<InstructionBridgeSnapshot> {
  const root = workspaceRoot ? path.resolve(workspaceRoot) : "";
  const agentsPath = root ? path.join(root, "AGENTS.md") : "";
  const hasAgentsFile = Boolean(root && fs.existsSync(agentsPath));
  const agentsText = hasAgentsFile ? safeReadFile(agentsPath) : "";

  const skillPaths: string[] = [];
  const actions: InstructionBridgeAction[] = [];
  if (root) {
    const skillsRoot = path.join(root, "skills");
    if (fs.existsSync(skillsRoot)) {
      const stack = [skillsRoot];
      while (stack.length > 0) {
        const current = stack.pop() as string;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          const nextPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            stack.push(nextPath);
            continue;
          }
          if (!/SKILL\.md$/i.test(entry.name)) continue;
          skillPaths.push(nextPath);
          const body = safeReadFile(nextPath);
          actions.push(summarizeSkill(nextPath, body));
        }
      }
    }
  }

  const promptSections = [
    hasAgentsFile
      ? `Workspace AGENTS.md:\n${agentsText.slice(0, 12_000)}`
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
    prompt: promptSections.join("\n\n").slice(0, 20_000),
    actions,
    skillPaths,
  };
}
