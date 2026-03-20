import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";
import type {
  BinaryArtifactState,
  BinaryExecutionState,
  BinarySourceGraph,
  BinarySourceGraphDependency,
  BinarySourceGraphDiagnostic,
  BinarySourceGraphFunction,
  BinarySourceGraphModule,
} from "@/lib/binary/contracts";

type DraftFiles = Record<string, string>;

function nowIso(): string {
  return new Date().toISOString();
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeRelativePath(value: string): string {
  return String(value || "").replace(/\\/g, "/");
}

function detectLanguage(filePath: string): string | undefined {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  if (normalized.endsWith(".tsx") || normalized.endsWith(".ts")) return "typescript";
  if (normalized.endsWith(".jsx") || normalized.endsWith(".js")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  return undefined;
}

function isTrackedSourceFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx)$/i.test(normalizeRelativePath(filePath));
}

function resolveImportPath(fromFile: string, importPath: string, knownFiles: Set<string>): string {
  const normalizedImport = normalizeRelativePath(importPath);
  if (!normalizedImport.startsWith(".")) return normalizedImport;

  const fromDir = path.posix.dirname(normalizeRelativePath(fromFile));
  const base = path.posix.normalize(path.posix.join(fromDir, normalizedImport));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) return candidate;
  }
  return base;
}

function getNodeModifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : [];
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(getNodeModifiers(node).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function buildFunctionSignature(name: string, parameters: ts.NodeArray<ts.ParameterDeclaration>): string {
  const args = parameters
    .map((parameter) => {
      const rawName = parameter.name.getText().trim();
      const type = parameter.type?.getText().trim();
      return type ? `${rawName}: ${type}` : rawName;
    })
    .join(", ");
  return `${name}(${args})`;
}

function collectModuleInfo(filePath: string, content: string, knownFiles: Set<string>): {
  module: BinarySourceGraphModule;
  dependencies: BinarySourceGraphDependency[];
} {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const exports = new Set<string>();
  const functions: BinarySourceGraphFunction[] = [];
  const dependencies: BinarySourceGraphDependency[] = [];

  const addImport = (value: string) => {
    const normalized = normalizeRelativePath(value);
    if (!normalized) return;
    imports.push(normalized);
    const resolved = resolveImportPath(filePath, normalized, knownFiles);
    const isResolved = !normalized.startsWith(".") || knownFiles.has(resolved);
    dependencies.push({
      from: normalizeRelativePath(filePath),
      to: resolved,
      kind: "import",
      resolved: isResolved,
    });
  };

  const pushFunction = (name: string, node: ts.FunctionLikeDeclarationBase, exported: boolean) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    if (exported) exports.add(normalizedName);
    functions.push({
      name: normalizedName,
      sourcePath: normalizeRelativePath(filePath),
      exported,
      async: Boolean(getNodeModifiers(node).some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)),
      callable: true,
      signature: buildFunctionSignature(normalizedName, node.parameters || ts.factory.createNodeArray()),
    });
  };

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleText =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text.trim() : "";
      if (moduleText) addImport(moduleText);
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      pushFunction(node.name.text, node, hasExportModifier(node));
      return;
    }

    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text.trim();
        const initializer = declaration.initializer;
        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
          pushFunction(name, initializer, exported);
          continue;
        }
        if (exported && name) exports.add(name);
      }
      return;
    }

    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      exports.add(node.expression.text.trim());
    }
  });

  return {
    module: {
      path: normalizeRelativePath(filePath),
      language: detectLanguage(filePath),
      imports,
      exports: Array.from(exports).slice(0, 120),
      functions: functions.slice(0, 120),
      completed: Boolean(String(content || "").trim()),
      diagnosticCount: 0,
    },
    dependencies,
  };
}

function formatDiagnostic(workspaceDir: string, diagnostic: ts.Diagnostic): BinarySourceGraphDiagnostic {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n").trim() || "Unknown TypeScript diagnostic.";
  const filePath = diagnostic.file?.fileName ? normalizeRelativePath(path.relative(workspaceDir, diagnostic.file.fileName)) : undefined;
  return {
    ...(filePath ? { path: filePath } : {}),
    code: String(diagnostic.code),
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    message,
  };
}

async function readDeclaredDependencies(workspaceDir: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(workspaceDir, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Array.from(
      new Set([
        ...Object.keys(parsed.dependencies || {}),
        ...Object.keys(parsed.devDependencies || {}),
      ])
    );
  } catch {
    return [];
  }
}

async function collectDiagnostics(workspaceDir: string, draftFiles: DraftFiles): Promise<BinarySourceGraphDiagnostic[]> {
  const rootNames = Object.keys(draftFiles)
    .filter((filePath) => isTrackedSourceFile(filePath))
    .map((filePath) => path.join(workspaceDir, filePath));
  if (!rootNames.length) return [];

  const options: ts.CompilerOptions = {
    noEmit: true,
    allowJs: true,
    checkJs: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram({
    rootNames,
    options,
    host,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => formatDiagnostic(workspaceDir, diagnostic))
    .slice(0, 500);
}

export async function buildBinarySourceGraph(input: {
  workspaceDir: string;
  draftFiles: DraftFiles;
  plannedSourceFiles?: string[];
}): Promise<BinarySourceGraph> {
  const knownFiles = new Set(
    Object.keys(input.draftFiles)
      .map((filePath) => normalizeRelativePath(filePath))
      .filter((filePath) => isTrackedSourceFile(filePath))
  );
  const modules: BinarySourceGraphModule[] = [];
  const dependencies: BinarySourceGraphDependency[] = [];

  for (const filePath of Object.keys(input.draftFiles).sort((left, right) => left.localeCompare(right))) {
    if (!isTrackedSourceFile(filePath)) continue;
    const { module, dependencies: nextDependencies } = collectModuleInfo(
      filePath,
      input.draftFiles[filePath],
      knownFiles
    );
    modules.push(module);
    dependencies.push(...nextDependencies);
  }

  for (const dependency of await readDeclaredDependencies(input.workspaceDir)) {
    dependencies.push({
      from: "package.json",
      to: dependency,
      kind: "dependency",
      resolved: true,
    });
  }

  const diagnostics = await collectDiagnostics(input.workspaceDir, input.draftFiles);
  const diagnosticCounts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.path) continue;
    diagnosticCounts.set(diagnostic.path, (diagnosticCounts.get(diagnostic.path) || 0) + 1);
  }

  const modulesWithDiagnostics = modules.map((module) => ({
    ...module,
    diagnosticCount: diagnosticCounts.get(module.path) || 0,
  }));

  const plannedModules = (input.plannedSourceFiles || []).filter((filePath) => isTrackedSourceFile(filePath));
  const totalModules = Math.max(plannedModules.length, modulesWithDiagnostics.length, 1);
  const readyModules = modulesWithDiagnostics.filter((module) => module.completed).length;
  const importEdges = dependencies.filter((dependency) => dependency.kind === "import");
  const resolvedImportEdges = importEdges.filter((dependency) => dependency.resolved).length;
  const exportedFunctionCount = modulesWithDiagnostics.reduce(
    (sum, module) => sum + module.functions.filter((fn) => fn.exported).length,
    0
  );
  const diagnosticsPenalty = Math.min(28, diagnostics.length * 4);
  const fileRatioScore = (readyModules / totalModules) * 54;
  const importScore = (importEdges.length ? resolvedImportEdges / importEdges.length : 1) * 21;
  const exportScore = Math.min(25, exportedFunctionCount * 5);
  const coverage = clampPercentage(fileRatioScore + importScore + exportScore - diagnosticsPenalty);

  return {
    coverage,
    readyModules,
    totalModules,
    modules: modulesWithDiagnostics,
    dependencies: dependencies.slice(0, 2_000),
    diagnostics,
    updatedAt: nowIso(),
  };
}

export function buildBinaryArtifactStateFromGraph(input: {
  plannedSourceFiles?: string[];
  sourceGraph: BinarySourceGraph | null | undefined;
  execution: BinaryExecutionState | null | undefined;
  outputFilesReady?: number;
  latestFile?: string;
  packaged?: boolean;
  packagedEntrypoint?: string | null;
}): BinaryArtifactState {
  const totalSources = Math.max(
    0,
    (input.plannedSourceFiles || []).filter((filePath) => isTrackedSourceFile(filePath)).length || input.sourceGraph?.totalModules || 0
  );
  const readySources = Math.max(0, Math.min(totalSources, input.sourceGraph?.readyModules || 0));
  const outputFilesReady = Math.max(0, input.outputFilesReady || 0);
  const runnable = Boolean(input.packaged ? outputFilesReady > 0 : input.execution?.runnable);
  const callableFunctions = (input.execution?.availableFunctions || []).map((fn) => `${fn.sourcePath}#${fn.name}`);
  const entryPoints = input.packaged && input.packagedEntrypoint
    ? [input.packagedEntrypoint]
    : callableFunctions.slice(0, 24);
  const coverage = input.packaged
    ? 100
    : clampPercentage((input.sourceGraph?.coverage || 0) * 0.82 + (runnable ? 14 : 0) + Math.min(6, outputFilesReady * 2));

  return {
    coverage,
    runnable,
    sourceFilesTotal: totalSources,
    sourceFilesReady: readySources,
    outputFilesReady,
    entryPoints,
    ...(input.latestFile ? { latestFile: normalizeRelativePath(input.latestFile) } : {}),
    updatedAt: nowIso(),
  };
}
