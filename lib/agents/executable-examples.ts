const MAX_EXAMPLES = 6;
const MAX_SNIPPET_CHARS = 2000;

export type ExampleKind = "curl" | "python" | "node" | "shell" | "json" | "other";

export interface ExecutableExample {
  kind: ExampleKind;
  language: string;
  snippet: string;
  action?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

function clampSnippet(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > MAX_SNIPPET_CHARS) return trimmed.slice(0, MAX_SNIPPET_CHARS);
  return trimmed;
}

function detectKind(language: string, snippet: string): ExampleKind {
  const lang = language.toLowerCase();
  if (lang.includes("python") || lang === "py") return "python";
  if (lang.includes("javascript") || lang === "js" || lang.includes("typescript") || lang === "ts") {
    return "node";
  }
  if (lang.includes("json")) return "json";
  if (lang.includes("bash") || lang.includes("sh") || lang.includes("shell") || lang.includes("zsh")) {
    if (/^\s*curl\s+/m.test(snippet)) return "curl";
    return "shell";
  }
  if (/^\s*curl\s+/m.test(snippet)) return "curl";
  return "other";
}

function extractCurlCommands(snippet: string): string[] {
  const lines = snippet.split("\n");
  const commands: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith("curl ")) {
      if (current.length > 0) {
        commands.push(current.join("\n"));
        current = [];
      }
      current.push(line.trimEnd());
      continue;
    }
    if (current.length > 0 && (line.trim().startsWith("-") || line.trim().startsWith("--") || line.trim().startsWith("\\"))) {
      current.push(line.trimEnd());
      continue;
    }
    if (current.length > 0) {
      commands.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) commands.push(current.join("\n"));
  return commands;
}

function parseCurlCommand(snippet: string): ExecutableExample["action"] | undefined {
  const tokens = snippet
    .replace(/\\\n/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0 || tokens[0] !== "curl") return undefined;

  let method = "GET";
  let url: string | undefined;
  const headers: Record<string, string> = {};
  let body: string | undefined;

  for (let i = 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      const next = tokens[i + 1];
      if (next) method = next.toUpperCase();
      i += 1;
      continue;
    }
    if (t === "-H" || t === "--header") {
      const next = tokens[i + 1];
      if (next) {
        const header = next.replace(/^['"]|['"]$/g, "");
        const idx = header.indexOf(":");
        if (idx > 0) {
          headers[header.slice(0, idx).trim()] = header.slice(idx + 1).trim();
        }
      }
      i += 1;
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      const next = tokens[i + 1];
      if (next) body = next.replace(/^['"]|['"]$/g, "");
      if (method === "GET") method = "POST";
      i += 1;
      continue;
    }
    if (!t.startsWith("-") && !url) {
      url = t.replace(/^['"]|['"]$/g, "");
    }
  }

  return {
    method,
    url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body,
  };
}

export function extractExecutableExamples(readme: string | null | undefined): ExecutableExample[] {
  if (!readme) return [];
  const examples: ExecutableExample[] = [];
  const fenceRegex = /```([\w+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(readme)) !== null) {
    const language = (match[1] || "text").trim().toLowerCase();
    const content = clampSnippet(match[2] || "");
    if (!content) continue;

    if (language.includes("bash") || language.includes("sh") || language.includes("shell")) {
      const curls = extractCurlCommands(content);
      for (const cmd of curls) {
        examples.push({
          kind: "curl",
          language: language || "shell",
          snippet: clampSnippet(cmd),
          action: parseCurlCommand(cmd),
        });
        if (examples.length >= MAX_EXAMPLES) return examples;
      }
    }

    const kind = detectKind(language, content);
    examples.push({ kind, language: language || "text", snippet: content });
    if (examples.length >= MAX_EXAMPLES) return examples;
  }
  return examples;
}
