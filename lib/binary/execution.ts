import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import ts from "typescript";
import type {
  BinaryExecutionFunction,
  BinaryExecutionRun,
  BinaryExecutionState,
  BinarySourceGraph,
} from "@/lib/binary/contracts";

type DraftFiles = Record<string, string>;

const RESULT_PREFIX = "__BINARY_RESULT__";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRelativePath(value: string): string {
  return String(value || "").replace(/\\/g, "/");
}

function isCodeFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|json)$/i.test(normalizeRelativePath(filePath));
}

function compiledPathForSource(sourcePath: string): string {
  const normalized = normalizeRelativePath(sourcePath);
  if (normalized.endsWith(".json")) return normalized;
  return normalized.replace(/\.(?:ts|tsx|js|jsx)$/i, ".js");
}

function extractAvailableFunctions(sourceGraph: BinarySourceGraph | null | undefined): BinaryExecutionFunction[] {
  if (!sourceGraph) return [];
  const seen = new Set<string>();
  const out: BinaryExecutionFunction[] = [];
  for (const module of sourceGraph.modules) {
    for (const fn of module.functions) {
      if (!fn.exported) continue;
      const key = `${fn.sourcePath}#${fn.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: fn.name,
        sourcePath: fn.sourcePath,
        mode: "stub",
        callable: fn.callable,
        ...(fn.signature ? { signature: fn.signature } : {}),
      });
    }
  }
  return out;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function materializeCompiledBundle(input: {
  draftFiles: DraftFiles;
}): Promise<{ dir: string; compiledBySource: Map<string, string> }> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpersona-binary-exec-"));
  const compiledBySource = new Map<string, string>();

  try {
    for (const [relativePath, content] of Object.entries(input.draftFiles)) {
      if (!isCodeFile(relativePath)) continue;
      const sourcePath = normalizeRelativePath(relativePath);
      const compiledRelativePath = compiledPathForSource(sourcePath);
      const outputPath = path.join(rootDir, compiledRelativePath);
      await ensureDir(path.dirname(outputPath));

      if (sourcePath.endsWith(".json")) {
        await fs.writeFile(outputPath, content, "utf8");
        compiledBySource.set(sourcePath, outputPath);
        continue;
      }

      const transpiled = ts.transpileModule(content, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
          esModuleInterop: true,
          resolveJsonModule: true,
          jsx: ts.JsxEmit.ReactJSX,
        },
        fileName: sourcePath,
        reportDiagnostics: false,
      });
      await fs.writeFile(outputPath, transpiled.outputText, "utf8");
      compiledBySource.set(sourcePath, outputPath);
    }

    return { dir: rootDir, compiledBySource };
  } catch (error) {
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => null);
    throw error;
  }
}

function extractResultPayload(stdout: string): { ok: boolean; functions?: string[]; result?: unknown; error?: string } | null {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith(RESULT_PREFIX)) continue;
    try {
      return JSON.parse(line.slice(RESULT_PREFIX.length)) as {
        ok: boolean;
        functions?: string[];
        result?: unknown;
        error?: string;
      };
    } catch {
      return null;
    }
  }
  return null;
}

async function runNodeBundle(input: {
  modulePath: string;
  entryPoint?: string;
  args?: unknown[];
}): Promise<{ ok: boolean; functions?: string[]; result?: unknown; error?: string; logs: string[] }> {
  const script = `
const targetPath = process.env.BINARY_MAIN_PATH;
const entryPoint = process.env.BINARY_ENTRY_POINT || "";
const args = JSON.parse(process.env.BINARY_ARGS || "[]");
(async () => {
  try {
    const mod = require(targetPath);
    if (!entryPoint) {
      const functions = Object.entries(mod).filter(([, value]) => typeof value === "function").map(([key]) => key);
      console.log("${RESULT_PREFIX}" + JSON.stringify({ ok: true, functions }));
      return;
    }
    const fn = mod[entryPoint];
    if (typeof fn !== "function") {
      throw new Error(\`Entry point "\${entryPoint}" is not callable.\`);
    }
    const result = await Promise.resolve(fn(...args));
    console.log("${RESULT_PREFIX}" + JSON.stringify({ ok: true, result }));
  } catch (error) {
    console.log("${RESULT_PREFIX}" + JSON.stringify({
      ok: false,
      error: error && typeof error === "object" && "message" in error ? String(error.message) : String(error)
    }));
    if (error && typeof error === "object" && "stack" in error) {
      console.error(String(error.stack));
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  }
})();
`;

  const child = spawn(process.execPath, ["-e", script], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BINARY_MAIN_PATH: input.modulePath,
      BINARY_ENTRY_POINT: input.entryPoint || "",
      BINARY_ARGS: JSON.stringify(input.args || []),
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });

  const payload = extractResultPayload(stdout);
  const logs = [
    ...stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith(RESULT_PREFIX)),
    ...stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  ].slice(-80);

  return {
    ok: Boolean(payload?.ok && exitCode === 0),
    functions: payload?.functions,
    result: payload?.result,
    error: payload?.error || (!payload?.ok && logs.at(-1) ? logs.at(-1) : undefined),
    logs,
  };
}

export async function computeBinaryExecutionState(input: {
  draftFiles: DraftFiles;
  sourceGraph: BinarySourceGraph | null | undefined;
}): Promise<BinaryExecutionState> {
  const availableFunctions = extractAvailableFunctions(input.sourceGraph);
  if (!availableFunctions.length) {
    return {
      runnable: false,
      mode: "none",
      availableFunctions: [],
      lastRun: null,
      updatedAt: nowIso(),
    };
  }

  const compiled = await materializeCompiledBundle({ draftFiles: input.draftFiles });
  try {
    const nativeKeys = new Set<string>();
    const uniqueSourcePaths = Array.from(new Set(availableFunctions.map((fn) => fn.sourcePath)));
    for (const sourcePath of uniqueSourcePaths) {
      const compiledPath = compiled.compiledBySource.get(sourcePath);
      if (!compiledPath) continue;
      const probe = await runNodeBundle({ modulePath: compiledPath });
      if (!probe.ok || !probe.functions?.length) continue;
      for (const functionName of probe.functions) {
        nativeKeys.add(`${sourcePath}#${functionName}`);
      }
    }

    const nextFunctions: BinaryExecutionFunction[] = availableFunctions.map((fn) => ({
      ...fn,
      mode: nativeKeys.has(`${fn.sourcePath}#${fn.name}`) ? "native" : "stub",
    }));
    const hasNative = nextFunctions.some((fn) => fn.mode === "native");
    return {
      runnable: true,
      mode: hasNative ? "native" : "stub",
      availableFunctions: nextFunctions,
      lastRun: null,
      updatedAt: nowIso(),
    };
  } finally {
    await fs.rm(compiled.dir, { recursive: true, force: true }).catch(() => null);
  }
}

function findExecutionFunction(
  execution: BinaryExecutionState,
  requestedEntryPoint: string
): BinaryExecutionFunction | null {
  const normalized = String(requestedEntryPoint || "").trim();
  if (!normalized) return null;
  return (
    execution.availableFunctions.find((fn) => fn.name === normalized) ||
    execution.availableFunctions.find((fn) => `${fn.sourcePath}#${fn.name}` === normalized) ||
    null
  );
}

export async function executeBinaryEntryPoint(input: {
  execution: BinaryExecutionState;
  draftFiles: DraftFiles;
  entryPoint: string;
  args?: unknown[];
}): Promise<{ execution: BinaryExecutionState; run: BinaryExecutionRun }> {
  const target = findExecutionFunction(input.execution, input.entryPoint);
  const startedAt = nowIso();

  if (!target) {
    const run: BinaryExecutionRun = {
      id: `exec_${Date.now().toString(36)}`,
      entryPoint: input.entryPoint,
      args: (input.args || []).slice(0, 20),
      status: "failed",
      logs: [],
      errorMessage: `Unknown entry point: ${input.entryPoint}`,
      startedAt,
      completedAt: nowIso(),
    };
    return {
      execution: {
        ...input.execution,
        lastRun: run,
        updatedAt: nowIso(),
      },
      run,
    };
  }

  if (target.mode !== "native") {
    const run: BinaryExecutionRun = {
      id: `exec_${Date.now().toString(36)}`,
      entryPoint: target.name,
      args: (input.args || []).slice(0, 20),
      status: "stubbed",
      outputJson: {
        ok: false,
        stubbed: true,
        entryPoint: target.name,
        sourcePath: target.sourcePath,
        message: "The partial runtime is not fully compiled yet, so Binary IDE returned a generated stub response.",
      },
      logs: [
        `Stub execution used for ${target.sourcePath}#${target.name}.`,
      ],
      startedAt,
      completedAt: nowIso(),
    };
    return {
      execution: {
        ...input.execution,
        lastRun: run,
        updatedAt: nowIso(),
      },
      run,
    };
  }

  const compiled = await materializeCompiledBundle({ draftFiles: input.draftFiles });
  try {
    const modulePath = compiled.compiledBySource.get(target.sourcePath);
    if (!modulePath) {
      const run: BinaryExecutionRun = {
        id: `exec_${Date.now().toString(36)}`,
        entryPoint: target.name,
        args: (input.args || []).slice(0, 20),
        status: "failed",
        logs: [],
        errorMessage: `Compiled module not available for ${target.sourcePath}.`,
        startedAt,
        completedAt: nowIso(),
      };
      return {
        execution: {
          ...input.execution,
          lastRun: run,
          updatedAt: nowIso(),
        },
        run,
      };
    }

    const result = await runNodeBundle({
      modulePath,
      entryPoint: target.name,
      args: (input.args || []).slice(0, 20),
    });
    const run: BinaryExecutionRun = {
      id: `exec_${Date.now().toString(36)}`,
      entryPoint: target.name,
      args: (input.args || []).slice(0, 20),
      status: result.ok ? "completed" : "failed",
      ...(typeof result.result !== "undefined" ? { outputJson: result.result } : {}),
      logs: result.logs,
      ...(result.error ? { errorMessage: result.error } : {}),
      startedAt,
      completedAt: nowIso(),
    };
    return {
      execution: {
        ...input.execution,
        lastRun: run,
        updatedAt: nowIso(),
      },
      run,
    };
  } finally {
    await fs.rm(compiled.dir, { recursive: true, force: true }).catch(() => null);
  }
}
