import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import Parser from "tree-sitter";
import treeSitterJavascript from "tree-sitter-javascript";
import treeSitterTypescript from "tree-sitter-typescript";
import treeSitterPython from "tree-sitter-python";
const MAX_SCAN_FILES = 240;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_SYMBOLS = 120;
const INCLUDE_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".json",
    ".toml",
    ".yml",
    ".yaml",
    ".md",
]);
const IGNORE_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".venv",
    "venv",
    "__pycache__",
]);
const SYMBOL_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const TREE_SITTER_JS_SPEC = {
    language: treeSitterJavascript,
    symbolNodeTypes: ["function_declaration", "class_declaration", "variable_declarator"],
    referenceNodeTypes: ["identifier", "property_identifier", "shorthand_property_identifier"],
};
const TREE_SITTER_TS_LANGUAGES = treeSitterTypescript;
const TREE_SITTER_TS_SPEC = {
    language: TREE_SITTER_TS_LANGUAGES.typescript,
    symbolNodeTypes: [
        "function_declaration",
        "class_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "variable_declarator",
    ],
    referenceNodeTypes: ["identifier", "property_identifier", "shorthand_property_identifier", "type_identifier"],
};
const TREE_SITTER_TSX_SPEC = {
    language: TREE_SITTER_TS_LANGUAGES.tsx,
    symbolNodeTypes: TREE_SITTER_TS_SPEC.symbolNodeTypes,
    referenceNodeTypes: TREE_SITTER_TS_SPEC.referenceNodeTypes,
};
const TREE_SITTER_PYTHON_SPEC = {
    language: treeSitterPython,
    symbolNodeTypes: ["function_definition", "class_definition"],
    referenceNodeTypes: ["identifier"],
};
function runCommand(command, args, cwd, timeoutMs = 8000) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };
        let stdout = "";
        let stderr = "";
        const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        const timer = setTimeout(() => {
            child.kill();
            finish({
                ok: false,
                stdout,
                stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`,
                exitCode: null,
            });
        }, timeoutMs);
        child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            finish({
                ok: false,
                stdout,
                stderr: `${stderr}\n${error.message}`,
                exitCode: null,
            });
        });
        child.on("close", (exitCode) => {
            clearTimeout(timer);
            finish({
                ok: exitCode === 0,
                stdout,
                stderr,
                exitCode,
            });
        });
    });
}
function nowIso() {
    return new Date().toISOString();
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}
function normalizeWorkspaceRoot(input) {
    return path.resolve(String(input || "").trim());
}
function hashValue(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function safeRelative(root, filePath) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    return rel || path.basename(filePath).replace(/\\/g, "/");
}
function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function takeTop(values, limit) {
    return values.slice(0, clamp(limit, 1, Math.max(1, values.length || 1)));
}
function buildEmptyFile() {
    return {
        version: 1,
        updatedAt: nowIso(),
        repos: [],
    };
}
function buildEmptyMemoryRecord(workspaceRoot, stack) {
    return {
        workspaceRoot,
        fingerprint: hashValue(workspaceRoot),
        updatedAt: nowIso(),
        stack,
        routePreferences: [],
        repairPlaybooks: [],
        proofTemplates: [],
        routineDistillations: [],
        verificationReceipts: [],
    };
}
async function readPackageJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return toObject(parsed);
    }
    catch {
        return null;
    }
}
async function readTextFile(filePath) {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
        return "";
    return await fs.readFile(filePath, "utf8").catch(() => "");
}
async function collectWorkspaceFiles(workspaceRoot) {
    const results = [];
    const queue = [workspaceRoot];
    while (queue.length > 0 && results.length < MAX_SCAN_FILES) {
        const current = queue.shift();
        if (!current)
            continue;
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (results.length >= MAX_SCAN_FILES)
                break;
            if (entry.name.startsWith(".") && ![".eslintrc", ".prettierrc", ".env.example"].includes(entry.name)) {
                if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
                    queue.push(path.join(current, entry.name));
                }
                continue;
            }
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!IGNORE_DIRS.has(entry.name))
                    queue.push(fullPath);
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (INCLUDE_EXTENSIONS.has(ext) || entry.name === "package.json" || entry.name === "pyproject.toml") {
                results.push(fullPath);
            }
        }
    }
    return results;
}
function inferStackFromFiles(files) {
    const lowered = files.map((filePath) => filePath.toLowerCase());
    if (lowered.some((filePath) => filePath.endsWith("package.json") || /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath))) {
        return "node_js_ts";
    }
    if (lowered.some((filePath) => filePath.endsWith("pyproject.toml") || filePath.endsWith("requirements.txt") || /\.py$/.test(filePath))) {
        return "python";
    }
    return "generic";
}
function pathLooksLikeTest(filePath) {
    return /(^|\/)(test|tests|__tests__)\/|(\.test|\.spec)\./i.test(filePath);
}
function pathLooksLikeEntrypoint(filePath) {
    return /(^|\/)(src\/)?(index|main|app|server|cli)\.(ts|tsx|js|jsx|py)$/i.test(filePath);
}
function extractImports(content) {
    const imports = new Set();
    const patterns = [
        /import\s+(?:type\s+)?(?:.+?\s+from\s+)?["']([^"']+)["']/g,
        /require\(\s*["']([^"']+)["']\s*\)/g,
        /from\s+["']([^"']+)["']/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content))) {
            const spec = compactWhitespace(match[1]);
            if (spec)
                imports.add(spec);
        }
    }
    return Array.from(imports);
}
function extractHeuristicSymbols(relativePath, content) {
    const records = [];
    const patterns = [
        { kind: "class", regex: /(^|\n)\s*(export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: "function", regex: /(^|\n)\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: "function", regex: /(^|\n)\s*(export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/g },
        { kind: "interface", regex: /(^|\n)\s*(export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/g },
        { kind: "type", regex: /(^|\n)\s*(export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g },
        { kind: "test", regex: /(^|\n)\s*(?:describe|it|test)\(\s*["'`]([^"'`]+)["'`]/g },
        { kind: "function", regex: /(^|\n)\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g },
        { kind: "class", regex: /(^|\n)\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:(]/g },
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(content))) {
            const candidate = compactWhitespace(match[3] || match[2] || match[1]);
            if (!candidate)
                continue;
            const prefix = content.slice(0, match.index);
            const line = prefix.split(/\r?\n/).length;
            records.push({
                name: candidate,
                kind: pattern.kind,
                path: relativePath,
                line,
                exported: /\bexport\b/.test(match[0]),
            });
            if (records.length >= MAX_SYMBOLS)
                return records;
        }
    }
    return records;
}
function getTreeSitterLanguageSpec(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs")
        return TREE_SITTER_JS_SPEC;
    if (ext === ".ts")
        return TREE_SITTER_TS_SPEC;
    if (ext === ".tsx")
        return TREE_SITTER_TSX_SPEC;
    if (ext === ".py")
        return TREE_SITTER_PYTHON_SPEC;
    return null;
}
function inferTreeSitterSymbolKind(node) {
    if (node.type === "class_declaration" || node.type === "class_definition")
        return "class";
    if (node.type === "interface_declaration")
        return "interface";
    if (node.type === "type_alias_declaration")
        return "type";
    if (node.type === "function_declaration" || node.type === "function_definition")
        return "function";
    if (node.type === "variable_declarator") {
        const valueNode = node.childForFieldName("value");
        if (valueNode &&
            ["arrow_function", "function", "function_expression", "generator_function", "generator_function_declaration"].includes(valueNode.type)) {
            return "function";
        }
        return "variable";
    }
    return inferSymbolKindFromSnippet(node.text);
}
function isTreeSitterExported(node) {
    let current = node;
    while (current) {
        if (current.type.startsWith("export"))
            return true;
        current = current.parent;
    }
    return false;
}
function extractTreeSitterSymbols(relativePath, content) {
    const spec = getTreeSitterLanguageSpec(relativePath);
    if (!spec || !content)
        return null;
    try {
        const parser = new Parser();
        parser.setLanguage(spec.language);
        const tree = parser.parse(content);
        const records = [];
        const seen = new Set();
        for (const node of tree.rootNode.descendantsOfType(spec.symbolNodeTypes)) {
            const nameNode = node.childForFieldName("name") || node.namedChildren.find((child) => /identifier$/.test(child.type)) || null;
            const name = compactWhitespace(nameNode?.text || "");
            if (!name || !SYMBOL_NAME_PATTERN.test(name))
                continue;
            const key = `${name}:${node.startPosition.row}:${node.type}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            records.push({
                name,
                kind: inferTreeSitterSymbolKind(node),
                path: relativePath,
                line: (nameNode || node).startPosition.row + 1,
                exported: isTreeSitterExported(node),
            });
            if (records.length >= MAX_SYMBOLS)
                break;
        }
        return records;
    }
    catch {
        return null;
    }
}
function extractReferences(symbols, content) {
    const references = [];
    const symbolNames = Array.from(new Set(symbols.map((symbol) => symbol.name))).slice(0, 80);
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        for (const name of symbolNames) {
            if (line.includes(name)) {
                references.push({
                    name,
                    line: index + 1,
                    excerpt: compactWhitespace(line).slice(0, 300),
                });
            }
        }
    }
    return references.slice(0, 200);
}
function extractTreeSitterReferences(relativePath, content, target, limit) {
    const spec = getTreeSitterLanguageSpec(relativePath);
    if (!spec || !content || !target)
        return [];
    try {
        const parser = new Parser();
        parser.setLanguage(spec.language);
        const tree = parser.parse(content);
        const lines = content.split(/\r?\n/);
        const seen = new Set();
        const references = [];
        for (const node of tree.rootNode.descendantsOfType(spec.referenceNodeTypes)) {
            if (compactWhitespace(node.text) !== target)
                continue;
            const line = node.startPosition.row + 1;
            const excerpt = compactWhitespace(lines[line - 1] || node.text).slice(0, 300);
            const key = `${relativePath}:${line}:${excerpt}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            references.push({ path: relativePath, line, excerpt });
            if (references.length >= limit)
                break;
        }
        return references;
    }
    catch {
        return [];
    }
}
function inferSymbolKindFromSnippet(snippet) {
    const normalized = compactWhitespace(snippet).toLowerCase();
    if (!normalized)
        return "unknown";
    if (normalized.includes("class "))
        return "class";
    if (normalized.includes("interface "))
        return "interface";
    if (normalized.includes("type "))
        return "type";
    if (normalized.includes("function ") || normalized.includes("=>"))
        return "function";
    if (normalized.includes("test(") || normalized.includes("describe(") || normalized.includes("it("))
        return "test";
    if (normalized.includes("const ") || normalized.includes("let ") || normalized.includes("var "))
        return "variable";
    return "unknown";
}
function parseAstGrepMatches(output, workspaceRoot) {
    const trimmed = output.trim();
    if (!trimmed)
        return [];
    const parsedRows = [];
    const parseOne = (raw) => {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed))
                parsedRows.push(...parsed);
            else
                parsedRows.push(parsed);
        }
        catch {
            // Ignore malformed row and let fallbacks handle empty output.
        }
    };
    if (trimmed.startsWith("[") || trimmed.startsWith("{"))
        parseOne(trimmed);
    else {
        for (const line of trimmed.split(/\r?\n/)) {
            const candidate = line.trim();
            if (candidate)
                parseOne(candidate);
        }
    }
    const results = [];
    for (const row of parsedRows) {
        const obj = toObject(row);
        if (!obj)
            continue;
        const fileValue = (typeof obj.file === "string" && obj.file) ||
            (typeof obj.path === "string" && obj.path) ||
            (typeof obj.relative_path === "string" && obj.relative_path) ||
            "";
        if (!fileValue)
            continue;
        const textValue = (typeof obj.text === "string" && obj.text) ||
            (typeof obj.lines === "string" && obj.lines) ||
            (typeof obj.snippet === "string" && obj.snippet) ||
            undefined;
        const range = toObject(obj.range);
        const start = toObject(range?.start);
        const startLine = typeof start?.line === "number" ? start.line + 1 : undefined;
        const absolutePath = path.isAbsolute(fileValue) ? fileValue : path.join(workspaceRoot, fileValue);
        results.push({
            path: safeRelative(workspaceRoot, absolutePath),
            line: Number.isFinite(startLine) ? startLine : undefined,
            text: textValue ? compactWhitespace(textValue).slice(0, 400) : undefined,
        });
    }
    return results;
}
async function scanWorkspace(workspaceRoot) {
    const files = await collectWorkspaceFiles(workspaceRoot);
    const relativeFiles = files.map((filePath) => safeRelative(workspaceRoot, filePath));
    const contentCache = new Map();
    const importsByFile = new Map();
    const symbolIndex = [];
    const symbolSourceByFile = new Map();
    const referencesByFile = new Map();
    for (let index = 0; index < files.length; index += 1) {
        const absolutePath = files[index];
        const relativePath = relativeFiles[index];
        const content = await readTextFile(absolutePath);
        contentCache.set(relativePath, content);
        if (!content)
            continue;
        const imports = extractImports(content);
        if (imports.length)
            importsByFile.set(relativePath, imports);
        const treeSitterSymbols = extractTreeSitterSymbols(relativePath, content);
        const symbols = treeSitterSymbols?.length ? treeSitterSymbols : extractHeuristicSymbols(relativePath, content);
        if (symbols.length) {
            symbolIndex.push(...symbols);
            symbolSourceByFile.set(relativePath, treeSitterSymbols?.length ? "tree_sitter" : "heuristic");
        }
        if (symbols.length)
            referencesByFile.set(relativePath, extractReferences(symbols, content));
    }
    return {
        workspaceRoot,
        files: relativeFiles,
        fileSet: new Set(relativeFiles),
        symbolIndex: symbolIndex.slice(0, MAX_SYMBOLS),
        symbolSourceByFile,
        importsByFile,
        referencesByFile,
        contentCache,
    };
}
function queryTreeSitterSymbolsFromScan(scan, query, targetPath, limit) {
    return scan.symbolIndex
        .filter((symbol) => {
        if (scan.symbolSourceByFile.get(symbol.path) !== "tree_sitter")
            return false;
        if (targetPath && symbol.path !== targetPath)
            return false;
        return symbol.name.toLowerCase().includes(query) || symbol.path.toLowerCase().includes(query);
    })
        .slice(0, limit);
}
function inferSymbolQueryEngine(symbols, scan) {
    if (symbols.length > 0 && symbols.every((symbol) => scan.symbolSourceByFile.get(symbol.path) === "tree_sitter")) {
        return "tree_sitter";
    }
    return "heuristic";
}
function findTreeSitterReferencesFromScan(scan, target, limit) {
    const references = [];
    const seen = new Set();
    for (const filePath of scan.files) {
        if (!getTreeSitterLanguageSpec(filePath))
            continue;
        const content = scan.contentCache.get(filePath) || "";
        if (!content || !content.includes(target))
            continue;
        for (const reference of extractTreeSitterReferences(filePath, content, target, limit - references.length)) {
            const key = `${reference.path}:${reference.line || 0}:${reference.excerpt || ""}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            references.push(reference);
            if (references.length >= limit)
                return references;
        }
    }
    return references;
}
function deriveProjectRoots(files) {
    const roots = new Set();
    for (const filePath of files) {
        const normalized = filePath.replace(/\\/g, "/");
        if (normalized.includes("/src/"))
            roots.add(normalized.split("/src/")[0] || ".");
        else if (normalized.includes("/tests/"))
            roots.add(normalized.split("/tests/")[0] || ".");
        else if (normalized.includes("/test/"))
            roots.add(normalized.split("/test/")[0] || ".");
    }
    if (!roots.size)
        roots.add(".");
    return Array.from(roots).slice(0, 12);
}
function deriveHotspots(scan) {
    const scored = scan.files.map((filePath) => {
        const symbolCount = scan.symbolIndex.filter((symbol) => symbol.path === filePath).length;
        const importCount = scan.importsByFile.get(filePath)?.length || 0;
        const score = symbolCount * 2 + importCount + (pathLooksLikeTest(filePath) ? 1 : 0);
        return { filePath, score };
    });
    return scored
        .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
        .map((item) => item.filePath)
        .slice(0, 12);
}
function deriveLikelyEntrypoints(files) {
    return files.filter(pathLooksLikeEntrypoint).slice(0, 8);
}
function deriveLikelyTests(files) {
    return files.filter(pathLooksLikeTest).slice(0, 10);
}
async function inferValidationPlanFromScan(workspaceRoot, scan, stack) {
    const checks = [];
    let primaryCommand = "";
    let reason = "";
    if (stack === "node_js_ts") {
        const packageJsonPath = path.join(workspaceRoot, "package.json");
        const pkg = await readPackageJson(packageJsonPath);
        const scripts = toObject(pkg?.scripts);
        if (scripts && typeof scripts.test === "string") {
            primaryCommand = "npm test";
            checks.push({
                id: "node:test",
                label: "Run project tests",
                command: "npm test",
                kind: "test",
                reason: "package.json exposes a test script.",
            });
        }
        else if (scan.files.some(pathLooksLikeTest)) {
            primaryCommand = "node --test";
            checks.push({
                id: "node:test",
                label: "Run node:test suite",
                command: "node --test",
                kind: "test",
                reason: "The repo contains JavaScript or TypeScript test files.",
            });
        }
        if (scripts && typeof scripts.lint === "string") {
            checks.push({
                id: "node:lint",
                label: "Run lint",
                command: "npm run lint",
                kind: "lint",
                reason: "package.json exposes a lint script.",
            });
        }
        if (scripts && typeof scripts.typecheck === "string") {
            checks.push({
                id: "node:typecheck",
                label: "Run typecheck",
                command: "npm run typecheck",
                kind: "typecheck",
                reason: "package.json exposes a typecheck script.",
            });
        }
        else if (scan.fileSet.has("tsconfig.json")) {
            checks.push({
                id: "node:tsc",
                label: "Run TypeScript compile check",
                command: "npx tsc --noEmit",
                kind: "typecheck",
                reason: "tsconfig.json is present.",
            });
        }
        reason = primaryCommand
            ? "Node/JS/TS repo validation inferred from package.json scripts and test layout."
            : "Node/JS/TS repo inferred, but no canonical validation command was found.";
    }
    else if (stack === "python") {
        if (scan.files.some(pathLooksLikeTest)) {
            primaryCommand = "python -m pytest";
            checks.push({
                id: "python:pytest",
                label: "Run pytest",
                command: "python -m pytest",
                kind: "test",
                reason: "The repo contains Python test files.",
            });
        }
        checks.push({
            id: "python:compile",
            label: "Byte-compile Python files",
            command: "python -m compileall .",
            kind: "verify",
            reason: "Python repos benefit from a syntax pass even when tests are sparse.",
        });
        reason = primaryCommand
            ? "Python repo validation inferred from test layout."
            : "Python repo inferred; using a conservative verification plan.";
    }
    else {
        if (scan.files.some(pathLooksLikeTest)) {
            checks.push({
                id: "generic:test",
                label: "Inspect or run the repo's canonical tests",
                kind: "verify",
                reason: "The repo includes test-like files, but the stack is not strongly inferred yet.",
            });
        }
        reason = "Generic repo validation plan inferred conservatively from file layout.";
    }
    return {
        status: "pending",
        primaryCommand: primaryCommand || undefined,
        checks,
        receipts: [],
        reason,
    };
}
function derivePreferredRoute(stack, memory) {
    const routePreference = memory.routePreferences
        .slice()
        .sort((left, right) => right.confidence - left.confidence || right.updatedAt.localeCompare(left.updatedAt))[0];
    if (routePreference) {
        return {
            preferredRoute: routePreference.kind,
            reason: routePreference.reason,
            informedBy: ["repo_memory", routePreference.kind],
        };
    }
    if (stack === "node_js_ts" || stack === "python") {
        return {
            preferredRoute: "shell_route",
            reason: "Coding repos are safest and fastest through terminal-first execution plus structured verification.",
            informedBy: ["stack", "terminal_first_policy"],
        };
    }
    return {
        preferredRoute: "desktop_background_route",
        reason: "Generic workspaces fall back to cautious background-safe execution when stack signals are weak.",
        informedBy: ["generic_stack"],
    };
}
function summarizeRepo(scan, stack, validationPlan, memory) {
    const parts = [
        `Workspace stack: ${stack.replace(/_/g, " ")}`,
        scan.files.length ? `Indexed files: ${scan.files.length}` : "",
        scan.symbolIndex.length ? `Symbols: ${scan.symbolIndex.length}` : "",
        validationPlan.primaryCommand ? `Primary validation: ${validationPlan.primaryCommand}` : "Primary validation: not inferred",
        memory.preferredValidationCommand ? `Remembered validation: ${memory.preferredValidationCommand}` : "",
        memory.repairPlaybooks.length ? `Known repair playbooks: ${memory.repairPlaybooks.length}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
}
function buildRepoSearchStrategy(validationPlan) {
    const astGrepAvailable = !!validationPlan.tooling?.astGrepAvailable;
    return {
        preferredToolOrder: ["search_workspace", "repo_query_symbols", "repo_find_references"],
        engineOrder: astGrepAvailable ? ["ast_grep", "tree_sitter", "heuristic"] : ["tree_sitter", "heuristic"],
        guidance: [
            "Use search_workspace first for broad file-name or text discovery.",
            "Use repo_query_symbols once you know a likely symbol name or path and want structural lookup.",
            "Use repo_find_references after you confirm the symbol and need cross-file impact.",
            astGrepAvailable
                ? "Repo symbol and reference tools prefer ast-grep first, then tree-sitter, then heuristic fallback."
                : "Repo symbol and reference tools prefer tree-sitter first, then heuristic fallback because ast-grep is unavailable.",
        ],
        tooling: {
            astGrepAvailable,
            treeSitterAvailable: true,
            heuristicAvailable: true,
        },
    };
}
export class RepoModelService {
    storagePath;
    loaded = false;
    writeChain = Promise.resolve();
    file = buildEmptyFile();
    toolingSnapshot;
    commandRunner;
    constructor(storagePath, deps = {}) {
        this.storagePath = storagePath;
        this.commandRunner = deps.commandRunner || runCommand;
    }
    async initialize() {
        if (this.loaded)
            return;
        this.loaded = true;
        if (!existsSync(this.storagePath)) {
            await this.persist();
            return;
        }
        try {
            const raw = JSON.parse(await fs.readFile(this.storagePath, "utf8"));
            this.file = {
                version: 1,
                updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
                repos: Array.isArray(raw.repos) ? raw.repos : [],
            };
        }
        catch {
            this.file = buildEmptyFile();
            await this.persist();
        }
    }
    async persist() {
        this.file.updatedAt = nowIso();
        this.writeChain = this.writeChain.then(async () => {
            await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
            await fs.writeFile(this.storagePath, JSON.stringify(this.file, null, 2), "utf8");
        });
        await this.writeChain;
    }
    ensureRepoMemory(workspaceRoot, stack) {
        const normalized = normalizeWorkspaceRoot(workspaceRoot);
        const existing = this.file.repos.find((repo) => normalizeWorkspaceRoot(repo.workspaceRoot) === normalized);
        if (existing) {
            existing.stack = stack || existing.stack;
            existing.updatedAt = nowIso();
            return existing;
        }
        const created = buildEmptyMemoryRecord(normalized, stack);
        this.file.repos.push(created);
        return created;
    }
    async isCommandAvailable(command) {
        const result = await this.commandRunner(command, ["--version"], path.dirname(this.storagePath), 5000).catch(() => ({
            ok: false,
            stdout: "",
            stderr: "",
            exitCode: null,
        }));
        return !!result.ok;
    }
    async getToolingSnapshot() {
        if (this.toolingSnapshot)
            return this.toolingSnapshot;
        const astGrepCommand = (await this.isCommandAvailable("ast-grep")) ? "ast-grep" : (await this.isCommandAvailable("sg")) ? "sg" : undefined;
        const semgrepAvailable = await this.isCommandAvailable("semgrep");
        this.toolingSnapshot = {
            astGrepCommand,
            semgrepAvailable,
        };
        return this.toolingSnapshot;
    }
    async runAstGrepQuery(workspaceRoot, pattern, limit) {
        const tooling = await this.getToolingSnapshot();
        const command = tooling.astGrepCommand;
        if (!command)
            return null;
        const args = ["run", "--pattern", pattern, "--json", workspaceRoot];
        const result = await this.commandRunner(command, args, workspaceRoot, 12_000).catch(() => null);
        if (!result?.ok)
            return null;
        const parsed = parseAstGrepMatches(result.stdout, workspaceRoot);
        return {
            matches: parsed.slice(0, clamp(limit, 1, 200)),
            command,
        };
    }
    async buildScan(workspaceRoot) {
        await this.initialize();
        const normalized = normalizeWorkspaceRoot(workspaceRoot);
        const scan = await scanWorkspace(normalized);
        const stack = inferStackFromFiles(scan.files);
        const memory = this.ensureRepoMemory(normalized, stack);
        await this.persist();
        return { scan, stack, memory };
    }
    async getSummary(workspaceRoot, task) {
        const { scan, stack, memory } = await this.buildScan(workspaceRoot);
        const validationPlan = await this.getValidationPlan(workspaceRoot);
        const routeHints = derivePreferredRoute(stack, memory);
        const summary = summarizeRepo(scan, stack, validationPlan, memory);
        const taskSignals = compactWhitespace(task || "");
        return {
            contextVersion: Date.now(),
            workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
            summary: taskSignals ? `${summary} | Task: ${taskSignals.slice(0, 220)}` : summary,
            stack,
            primaryValidationCommand: validationPlan.primaryCommand,
            projectRoots: deriveProjectRoots(scan.files),
            hotspots: deriveHotspots(scan),
            likelyEntrypoints: deriveLikelyEntrypoints(scan.files),
            likelyTests: deriveLikelyTests(scan.files),
            symbolIndex: scan.symbolIndex.slice(0, 40),
            routeHints,
            searchStrategy: buildRepoSearchStrategy(validationPlan),
            memory: {
                preferredValidationCommand: memory.preferredValidationCommand,
                preferredBranchPrefix: memory.preferredBranchPrefix,
                knownRepairPatterns: takeTop(memory.repairPlaybooks.map((item) => item.summary), 8),
                proofTemplates: takeTop(memory.proofTemplates.map((item) => item.summary), 6),
            },
        };
    }
    async querySymbols(workspaceRoot, input) {
        const { scan } = await this.buildScan(workspaceRoot);
        const query = compactWhitespace(input.query || "").toLowerCase();
        const targetPath = compactWhitespace(input.path || "").replace(/\\/g, "/");
        const limit = clamp(Number(input.limit || 12), 1, 60);
        const fallbackSymbols = scan.symbolIndex.filter((symbol) => {
            if (targetPath && symbol.path !== targetPath)
                return false;
            if (!query)
                return true;
            return symbol.name.toLowerCase().includes(query) || symbol.path.toLowerCase().includes(query);
        });
        if (query) {
            const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
            const astGrep = await this.runAstGrepQuery(normalizedRoot, query, limit * 4);
            if (astGrep && astGrep.matches.length > 0) {
                const deduped = new Set();
                const symbols = [];
                for (const match of astGrep.matches) {
                    if (targetPath && match.path !== targetPath)
                        continue;
                    const key = `${match.path}:${match.line || 0}:${match.text || ""}`;
                    if (deduped.has(key))
                        continue;
                    deduped.add(key);
                    symbols.push({
                        name: query,
                        kind: inferSymbolKindFromSnippet(match.text || ""),
                        path: match.path,
                        line: match.line,
                        exported: match.text ? /\bexport\b/.test(match.text) : undefined,
                    });
                    if (symbols.length >= limit)
                        break;
                }
                return {
                    contextVersion: Date.now(),
                    workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
                    symbols,
                    engine: "ast_grep",
                };
            }
            const treeSitterSymbols = queryTreeSitterSymbolsFromScan(scan, query, targetPath, limit);
            if (treeSitterSymbols.length > 0) {
                return {
                    contextVersion: Date.now(),
                    workspaceRoot: normalizedRoot,
                    symbols: treeSitterSymbols,
                    engine: "tree_sitter",
                    fallbackReason: astGrep
                        ? "ast-grep returned no matches; used the tree-sitter symbol index."
                        : "ast-grep unavailable; used the tree-sitter symbol index.",
                };
            }
            if (astGrep && astGrep.matches.length === 0) {
                return {
                    contextVersion: Date.now(),
                    workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
                    symbols: fallbackSymbols.slice(0, limit),
                    engine: inferSymbolQueryEngine(fallbackSymbols.slice(0, limit), scan),
                    fallbackReason: "ast-grep returned no matches for the requested query.",
                };
            }
        }
        return {
            contextVersion: Date.now(),
            workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
            symbols: fallbackSymbols.slice(0, limit),
            engine: inferSymbolQueryEngine(fallbackSymbols.slice(0, limit), scan),
            fallbackReason: query ? "ast-grep unavailable; used heuristic symbol scan." : undefined,
        };
    }
    async findReferences(workspaceRoot, input) {
        const { scan } = await this.buildScan(workspaceRoot);
        const target = compactWhitespace(input.symbol || "");
        const limit = clamp(Number(input.limit || 20), 1, 80);
        if (!target)
            return { symbol: "", references: [], engine: "heuristic" };
        const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
        const astGrep = await this.runAstGrepQuery(normalizedRoot, target, limit * 4);
        if (astGrep && astGrep.matches.length > 0) {
            return {
                symbol: target,
                references: astGrep.matches.slice(0, limit).map((match) => ({
                    path: match.path,
                    line: match.line,
                    excerpt: match.text,
                })),
                engine: "ast_grep",
            };
        }
        const treeSitterReferences = findTreeSitterReferencesFromScan(scan, target, limit);
        if (treeSitterReferences.length > 0) {
            return {
                symbol: target,
                references: treeSitterReferences,
                engine: "tree_sitter",
                fallbackReason: astGrep
                    ? "ast-grep returned no references; used tree-sitter identifier lookup."
                    : "ast-grep unavailable; used tree-sitter identifier lookup.",
            };
        }
        const references = [];
        for (const [filePath, items] of scan.referencesByFile.entries()) {
            for (const item of items) {
                if (item.name === target || item.excerpt?.includes(target)) {
                    references.push({
                        path: filePath,
                        line: item.line,
                        excerpt: item.excerpt,
                    });
                }
            }
        }
        if (references.length === 0) {
            for (const [filePath, content] of scan.contentCache.entries()) {
                if (!content.includes(target))
                    continue;
                const lines = content.split(/\r?\n/);
                for (let index = 0; index < lines.length; index += 1) {
                    if (lines[index].includes(target)) {
                        references.push({
                            path: filePath,
                            line: index + 1,
                            excerpt: compactWhitespace(lines[index]).slice(0, 300),
                        });
                    }
                }
            }
        }
        return {
            symbol: target,
            references: references.slice(0, limit),
            engine: "heuristic",
            fallbackReason: astGrep ? "ast-grep returned no references; used heuristic fallback." : "ast-grep unavailable.",
        };
    }
    async getChangeImpact(workspaceRoot, input) {
        const { scan } = await this.buildScan(workspaceRoot);
        const limit = clamp(Number(input.limit || 12), 1, 50);
        const relativePath = compactWhitespace(input.path || "").replace(/\\/g, "/");
        const symbol = compactWhitespace(input.symbol || "");
        const impactedFiles = new Set();
        const impactedSymbols = new Set();
        if (relativePath) {
            impactedFiles.add(relativePath);
            const localImports = scan.importsByFile.get(relativePath) || [];
            for (const imported of localImports) {
                const normalizedImport = imported.replace(/^\.\/+/, "").replace(/\\/g, "/");
                for (const filePath of scan.files) {
                    if (filePath.includes(normalizedImport))
                        impactedFiles.add(filePath);
                }
            }
            for (const entry of scan.symbolIndex.filter((item) => item.path === relativePath)) {
                impactedSymbols.add(entry.name);
            }
        }
        if (symbol) {
            impactedSymbols.add(symbol);
            const refs = await this.findReferences(workspaceRoot, { symbol, limit });
            for (const ref of refs.references) {
                impactedFiles.add(ref.path);
            }
        }
        return {
            subject: symbol || relativePath || "workspace",
            impactedFiles: Array.from(impactedFiles).slice(0, limit),
            impactedSymbols: Array.from(impactedSymbols).slice(0, limit),
            reason: symbol
                ? `Impact derived from references to ${symbol}.`
                : relativePath
                    ? `Impact derived from imports and symbols in ${relativePath}.`
                    : "Impact fallback uses the current workspace scan.",
        };
    }
    async getValidationPlan(workspaceRoot, input) {
        const { scan, stack, memory } = await this.buildScan(workspaceRoot);
        const inferred = await inferValidationPlanFromScan(workspaceRoot, scan, stack);
        const tooling = await this.getToolingSnapshot();
        if (tooling.semgrepAvailable) {
            inferred.checks.push({
                id: "verify:semgrep_auto",
                label: "Run Semgrep auto rules",
                command: "semgrep --config auto .",
                kind: "verify",
                reason: "Semgrep is available locally for diff-level security and regression checks.",
                engine: "semgrep",
            });
        }
        const receipts = memory.verificationReceipts
            .slice()
            .sort((left, right) => right.at.localeCompare(left.at))
            .slice(0, 6);
        const status = receipts[0]?.status || inferred.status;
        const primaryCommand = memory.preferredValidationCommand || inferred.primaryCommand;
        const pathScope = Array.isArray(input?.paths) && input.paths.length ? ` for ${input.paths.slice(0, 4).join(", ")}` : "";
        return {
            status,
            primaryCommand,
            checks: inferred.checks.map((check) => ({
                ...check,
                command: check.command || primaryCommand,
            })),
            receipts: receipts.map((receipt) => `${receipt.status}: ${receipt.summary}`),
            reason: `${inferred.reason}${pathScope}`,
            tooling: {
                astGrepAvailable: !!tooling.astGrepCommand,
                semgrepAvailable: tooling.semgrepAvailable,
            },
        };
    }
    async recordVerification(workspaceRoot, input) {
        const normalized = normalizeWorkspaceRoot(workspaceRoot);
        const { stack, memory } = await this.buildScan(normalized);
        const receipt = {
            id: `repo_verification_${hashValue(`${normalized}:${input.label}:${Date.now()}`)}`,
            label: compactWhitespace(input.label).slice(0, 200),
            summary: compactWhitespace(input.summary).slice(0, 2000),
            status: input.status,
            command: compactWhitespace(input.command || "") || undefined,
            failureCategory: compactWhitespace(input.failureCategory || "") || undefined,
            targetHint: compactWhitespace(input.targetHint || "") || undefined,
            at: nowIso(),
        };
        memory.stack = stack;
        memory.updatedAt = nowIso();
        memory.verificationReceipts = [receipt, ...memory.verificationReceipts].slice(0, 24);
        if (receipt.command && receipt.status === "passed") {
            memory.preferredValidationCommand = receipt.command;
            memory.routePreferences = [
                {
                    kind: "shell_route",
                    confidence: 0.92,
                    reason: `Recent successful verification used ${receipt.command}.`,
                    updatedAt: nowIso(),
                },
                ...memory.routePreferences.filter((item) => item.kind !== "shell_route"),
            ].slice(0, 8);
            memory.proofTemplates = [
                {
                    label: receipt.label,
                    summary: receipt.summary,
                    updatedAt: nowIso(),
                },
                ...memory.proofTemplates.filter((item) => item.summary !== receipt.summary),
            ].slice(0, 12);
        }
        if (receipt.failureCategory || receipt.targetHint) {
            memory.repairPlaybooks = [
                {
                    failureCategory: receipt.failureCategory || "verification_failure",
                    targetHint: receipt.targetHint,
                    command: receipt.command,
                    summary: receipt.summary,
                    confidence: receipt.status === "failed" ? 0.82 : 0.65,
                    updatedAt: nowIso(),
                },
                ...memory.repairPlaybooks.filter((item) => item.summary !== receipt.summary ||
                    item.failureCategory !== (receipt.failureCategory || "verification_failure")),
            ].slice(0, 16);
        }
        await this.persist();
        return receipt;
    }
}
