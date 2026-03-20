import type { BinaryBuildRequest, BinaryManifest, BinaryPlanPreview } from "@/lib/binary/contracts";
import { synthesizeBinaryWorkspaceSpec } from "@/lib/binary/template";
import { resolvePlaygroundModelSelection } from "@/lib/playground/model-registry";

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_MAX_TOKENS = 2_000;
const DEFAULT_DELTA_CHUNK_SIZE = 1_600;

type ProviderChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type BinaryGenerationPreparedWorkspace = {
  providerName: string;
  files: Record<string, string>;
  warnings: string[];
  manifestBase: Omit<BinaryManifest, "buildId" | "createdAt" | "sourceFiles" | "outputFiles" | "warnings">;
  plan: BinaryPlanPreview;
};

export type BinaryGenerationProviderInput = {
  request: BinaryBuildRequest;
  existingFiles?: Record<string, string>;
};

export type BinaryGenerationProvider = {
  name: string;
  generate: (input: BinaryGenerationProviderInput) => Promise<BinaryGenerationPreparedWorkspace | null>;
};

export type BinaryGenerationStreamDelta = {
  path: string;
  language?: string;
  content: string;
  completed: boolean;
  order: number;
  operation: "upsert";
};

function normalizeRelativePath(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\\/g, "/");
}

function sanitizeWorkspacePath(value: string | null | undefined): string | null {
  const normalized = normalizeRelativePath(value).replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

function sanitizeWorkspaceCodePath(value: string | null | undefined): string | null {
  const normalized = sanitizeWorkspacePath(value);
  if (!normalized || !/\.(?:ts|tsx|js|jsx)$/i.test(normalized)) return null;
  return normalized;
}

function detectLanguage(filePath: string): string | undefined {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  if (normalized.endsWith(".tsx") || normalized.endsWith(".ts")) return "typescript";
  if (normalized.endsWith(".jsx") || normalized.endsWith(".js")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  return undefined;
}

function toOutputEntrypoint(sourcePath: string): string {
  return `dist/${normalizeRelativePath(sourcePath).replace(/\.(?:ts|tsx|js|jsx)$/i, ".js")}`;
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mergeWorkspaceFiles(
  existingFiles: Record<string, string> | undefined,
  nextFiles: Record<string, string>
): Record<string, string> {
  return {
    ...(existingFiles || {}),
    ...nextFiles,
  };
}

function buildPlanPreview(input: {
  manifestBase: BinaryGenerationPreparedWorkspace["manifestBase"];
  files: Record<string, string>;
  warnings: string[];
}): BinaryPlanPreview {
  return {
    name: input.manifestBase.name,
    displayName: input.manifestBase.displayName,
    description: input.manifestBase.description,
    entrypoint: input.manifestBase.entrypoint,
    buildCommand: input.manifestBase.buildCommand,
    startCommand: input.manifestBase.startCommand,
    sourceFiles: Object.keys(input.files).sort((left, right) => left.localeCompare(right)),
    warnings: input.warnings.slice(0, 50),
  };
}

function fallbackPreparedWorkspace(input: BinaryGenerationProviderInput): BinaryGenerationPreparedWorkspace {
  const spec = synthesizeBinaryWorkspaceSpec(input.request);
  const files = mergeWorkspaceFiles(input.existingFiles, spec.sourceFiles);
  return {
    providerName: "template_fallback",
    files,
    warnings: spec.warnings,
    manifestBase: {
      ...spec.manifestBase,
    },
    plan: buildPlanPreview({
      manifestBase: spec.manifestBase,
      files,
      warnings: spec.warnings,
    }),
  };
}

function getHfRouterToken(): string | null {
  const token =
    process.env.HF_ROUTER_TOKEN ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_TOKEN ||
    "";
  return token.trim() || null;
}

function normalizeHfRouterModelId(model: string): string {
  const raw = String(model || "").trim();
  if (!raw) return "";
  return raw.includes(":") ? raw.split(":")[0].trim() : raw;
}

function coerceMaxTokens(input: unknown, fallback: number): number {
  const value = typeof input === "number" ? input : Number(input);
  const base = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(512, Math.min(base, 4_096));
}

function buildBinaryGenerationPrompt(input: BinaryBuildRequest): string {
  return [
    "Create a portable TypeScript service workspace for Binary IDE.",
    "Return JSON only.",
    'Use this shape exactly: {"displayName":"string","description":"string","entrypoint":"path.ts","files":{"path":"full file content"}}',
    "The workspace must compile with npm + TypeScript and be directly runnable with node after build.",
    "Prefer CommonJS-compatible TypeScript that exports callable functions before starting any server.",
    "Honor the workspace context and target paths when deciding which file path to generate.",
    `Intent: ${input.intent}`,
    `Runtime: ${input.targetEnvironment.runtime}`,
    input.context?.activeFile?.path ? `Active file: ${input.context.activeFile.path}` : "Active file: none",
    input.retrievalHints?.preferredTargetPath
      ? `Preferred target path: ${input.retrievalHints.preferredTargetPath}`
      : "Preferred target path: none",
    input.retrievalHints?.mentionedPaths?.length
      ? `Mentioned paths: ${input.retrievalHints.mentionedPaths.slice(0, 6).join(", ")}`
      : "Mentioned paths: none",
    input.context?.openFiles?.length
      ? `Open files: ${input.context.openFiles.slice(0, 6).map((file) => file.path).join(", ")}`
      : "Open files: none",
  ].join("\n");
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, index + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const candidates = [
    String(text || "").trim(),
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(String(text || "").trim())?.[1] || "",
    extractBalancedJsonObject(text) || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }

  return null;
}

function coerceGeneratedFiles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawPath, rawContent] of Object.entries(value)) {
    const sanitizedPath = sanitizeWorkspacePath(rawPath);
    if (!sanitizedPath) continue;
    const content = typeof rawContent === "string" ? rawContent : "";
    if (!content.trim()) continue;
    out[sanitizedPath] = content;
  }
  return out;
}

async function callHostedWorkspaceModel(input: BinaryBuildRequest): Promise<Record<string, unknown> | null> {
  const token = getHfRouterToken();
  if (!token) return null;

  const modelSelection = resolvePlaygroundModelSelection();
  const model = normalizeHfRouterModelId(modelSelection.resolvedEntry.model);
  if (!model) return null;

  const response = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: coerceMaxTokens(DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS),
      messages: [
        {
          role: "system",
          content: [
            "You generate Binary IDE starter workspaces.",
            "Return JSON only.",
            'Use this exact shape: {"displayName":"string","description":"string","entrypoint":"path.ts","files":{"path":"full file content"}}',
          ].join("\n"),
        },
        {
          role: "user",
          content: buildBinaryGenerationPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`HF router request failed (${response.status}): ${raw}`);
  }

  const payload = (await response.json()) as ProviderChatResponse;
  const text = String(payload.choices?.[0]?.message?.content || "").trim();
  return parseJsonCandidate(text);
}

const hostedGenerationProvider: BinaryGenerationProvider = {
  name: "hf_router_hosted",
  async generate(input) {
    const fallback = fallbackPreparedWorkspace(input);
    const parsed = await callHostedWorkspaceModel(input.request);
    if (!parsed) return null;

    const generatedFiles = coerceGeneratedFiles(parsed.files);
    const files = mergeWorkspaceFiles(input.existingFiles, generatedFiles);
    if (!Object.keys(files).length) return null;

    const preferredEntrypoint =
      sanitizeWorkspaceCodePath(typeof parsed.entrypoint === "string" ? parsed.entrypoint : "") ||
      Object.keys(files).find((filePath) => Boolean(sanitizeWorkspaceCodePath(filePath))) ||
      "";
    const entrySourcePath = preferredEntrypoint || Object.keys(fallback.files).find((filePath) => /\.(?:ts|tsx|js|jsx)$/i.test(filePath)) || "src/index.ts";
    const warnings = fallback.warnings.slice();
    if (!Object.keys(generatedFiles).length) {
      warnings.push("Hosted generation returned no usable files, so Binary IDE kept the fallback workspace.");
    }

    const manifestBase: BinaryGenerationPreparedWorkspace["manifestBase"] = {
      ...fallback.manifestBase,
      displayName: compactWhitespace(typeof parsed.displayName === "string" ? parsed.displayName : "") || fallback.manifestBase.displayName,
      description: compactWhitespace(typeof parsed.description === "string" ? parsed.description : "") || fallback.manifestBase.description,
      intent: compactWhitespace(input.request.intent) || fallback.manifestBase.intent,
      entrypoint: toOutputEntrypoint(entrySourcePath),
    };

    return {
      providerName: hostedGenerationProvider.name,
      files,
      warnings,
      manifestBase,
      plan: buildPlanPreview({
        manifestBase,
        files,
        warnings,
      }),
    };
  },
};

const templateGenerationProvider: BinaryGenerationProvider = {
  name: "template_fallback",
  async generate(input) {
    return fallbackPreparedWorkspace(input);
  },
};

export async function prepareBinaryGenerationWorkspace(
  input: BinaryGenerationProviderInput
): Promise<BinaryGenerationPreparedWorkspace> {
  try {
    const hosted = await hostedGenerationProvider.generate(input);
    if (hosted) return hosted;
  } catch {
    // Fall through to the deterministic template provider.
  }
  return templateGenerationProvider.generate(input).then((workspace) => workspace || fallbackPreparedWorkspace(input));
}

export async function* streamBinaryGenerationDeltas(input: {
  files: Record<string, string>;
  chunkSize?: number;
}): AsyncGenerator<BinaryGenerationStreamDelta> {
  const chunkSize = Math.max(256, Math.min(Number(input.chunkSize || DEFAULT_DELTA_CHUNK_SIZE), 20_000));
  let order = 0;
  for (const filePath of Object.keys(input.files).sort((left, right) => left.localeCompare(right))) {
    const content = String(input.files[filePath] || "");
    if (!content.length) {
      yield {
        path: filePath,
        language: detectLanguage(filePath),
        content: "",
        completed: true,
        order: order++,
        operation: "upsert",
      };
      continue;
    }

    if (content.length <= chunkSize) {
      yield {
        path: filePath,
        language: detectLanguage(filePath),
        content,
        completed: true,
        order: order++,
        operation: "upsert",
      };
      continue;
    }

    let cursor = 0;
    while (cursor < content.length) {
      const nextCursor = Math.min(content.length, cursor + chunkSize);
      yield {
        path: filePath,
        language: detectLanguage(filePath),
        content: content.slice(0, nextCursor),
        completed: nextCursor >= content.length,
        order: order++,
        operation: "upsert",
      };
      cursor = nextCursor;
    }
  }
}
