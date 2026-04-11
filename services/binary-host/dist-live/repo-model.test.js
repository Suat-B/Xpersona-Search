import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { RepoModelService } from "./repo-model.js";
const tempRoots = [];
async function createRepoService(commandRunner) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "binary-repo-model-"));
    tempRoots.push(root);
    const service = new RepoModelService(path.join(root, "repo-model.json"), commandRunner ? { commandRunner } : {});
    await service.initialize();
    return { service, root };
}
afterEach(async () => {
    while (tempRoots.length) {
        const root = tempRoots.pop();
        if (root) {
            await fs.rm(root, { recursive: true, force: true });
        }
    }
});
describe("RepoModelService", () => {
    it("builds a local repo summary with symbols, hotspots, and validation hints", async () => {
        const { service, root } = await createRepoService();
        await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test", lint: "eslint ." } }, null, 2), "utf8");
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.mkdir(path.join(root, "test"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "index.ts"), "export function greet(name: string) { return `hi ${name}`; }\n", "utf8");
        await fs.writeFile(path.join(root, "test", "index.test.ts"), "import { test } from 'node:test';\nimport { greet } from '../src/index';\ntest('greet', () => greet('x'));\n", "utf8");
        const summary = await service.getSummary(root, "Fix greet and verify it");
        const validation = await service.getValidationPlan(root);
        const refs = await service.findReferences(root, { symbol: "greet" });
        expect(summary.stack).toBe("node_js_ts");
        expect(summary.primaryValidationCommand).toBe("npm test");
        expect(summary.hotspots.some((item) => item.includes("src/index.ts"))).toBe(true);
        expect(summary.symbolIndex.some((symbol) => symbol.name === "greet")).toBe(true);
        expect(summary.searchStrategy.preferredToolOrder).toEqual([
            "search_workspace",
            "repo_query_symbols",
            "repo_find_references",
        ]);
        expect(validation.primaryCommand).toBe("npm test");
        expect(refs.references.some((ref) => ref.path.includes("src/index.ts") || ref.path.includes("test/index.test.ts"))).toBe(true);
        expect(validation.tooling?.semgrepAvailable).toBe(false);
        expect(["heuristic", "tree_sitter"]).toContain(refs.engine);
    });
    it("records verification memory and prefers shell routing after successful validation", async () => {
        const { service, root } = await createRepoService();
        await fs.writeFile(path.join(root, "pyproject.toml"), "[project]\nname='demo'\n", "utf8");
        await fs.mkdir(path.join(root, "tests"), { recursive: true });
        await fs.writeFile(path.join(root, "tests", "test_sample.py"), "def test_ok():\n    assert True\n", "utf8");
        await service.recordVerification(root, {
            label: "Pytest passed",
            summary: "python -m pytest passed cleanly",
            status: "passed",
            command: "python -m pytest",
        });
        const summary = await service.getSummary(root);
        const validation = await service.getValidationPlan(root);
        expect(summary.routeHints.preferredRoute).toBe("shell_route");
        expect(summary.memory.preferredValidationCommand).toBe("python -m pytest");
        expect(validation.receipts[0]).toContain("python -m pytest passed cleanly");
    });
    it("uses ast-grep engine for symbol and reference lookup when available", async () => {
        const commandRunner = async (command, args) => {
            if ((command === "ast-grep" || command === "sg") && args[0] === "--version") {
                return { ok: true, stdout: "ast-grep 0.38.0", stderr: "", exitCode: 0 };
            }
            if (command === "semgrep" && args[0] === "--version") {
                return { ok: false, stdout: "", stderr: "missing", exitCode: 1 };
            }
            if ((command === "ast-grep" || command === "sg") && args[0] === "run") {
                return {
                    ok: true,
                    stdout: JSON.stringify([
                        {
                            file: "src/index.ts",
                            text: "export function greet(name: string) { return `hi ${name}`; }",
                            range: { start: { line: 0 } },
                        },
                    ]),
                    stderr: "",
                    exitCode: 0,
                };
            }
            return { ok: false, stdout: "", stderr: "unsupported", exitCode: 1 };
        };
        const { service, root } = await createRepoService(commandRunner);
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "index.ts"), "export function greet(name: string) { return `hi ${name}`; }\n", "utf8");
        const symbols = await service.querySymbols(root, { query: "greet", limit: 5 });
        const refs = await service.findReferences(root, { symbol: "greet", limit: 5 });
        expect(symbols.engine).toBe("ast_grep");
        expect(symbols.symbols[0]?.path).toContain("src/index.ts");
        expect(refs.engine).toBe("ast_grep");
        expect(refs.references[0]?.excerpt).toContain("greet");
    });
    it("uses tree-sitter fallback when ast-grep is unavailable", async () => {
        const commandRunner = async () => {
            return { ok: false, stdout: "", stderr: "missing", exitCode: 1 };
        };
        const { service, root } = await createRepoService(commandRunner);
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "person.ts"), [
            "export interface Person {",
            "  name: string;",
            "}",
            "",
            "export const greet = (name: string) => `hi ${name}`;",
        ].join("\n"), "utf8");
        await fs.writeFile(path.join(root, "src", "use.ts"), ["import { greet } from './person';", "export const message = greet('Ada');", ""].join("\n"), "utf8");
        const summary = await service.getSummary(root);
        const symbols = await service.querySymbols(root, { query: "greet", limit: 5 });
        const refs = await service.findReferences(root, { symbol: "greet", limit: 5 });
        expect(summary.symbolIndex.some((symbol) => symbol.name === "Person" && symbol.kind === "interface")).toBe(true);
        expect(symbols.engine).toBe("tree_sitter");
        expect(symbols.symbols[0]?.kind).toBe("function");
        expect(refs.engine).toBe("tree_sitter");
        expect(refs.references.some((ref) => ref.path.includes("src/use.ts"))).toBe(true);
    });
    it("adds semgrep checks to validation plans when semgrep is available", async () => {
        const commandRunner = async (command, args) => {
            if (command === "ast-grep" && args[0] === "--version") {
                return { ok: false, stdout: "", stderr: "missing", exitCode: 1 };
            }
            if (command === "sg" && args[0] === "--version") {
                return { ok: false, stdout: "", stderr: "missing", exitCode: 1 };
            }
            if (command === "semgrep" && args[0] === "--version") {
                return { ok: true, stdout: "1.99.0", stderr: "", exitCode: 0 };
            }
            return { ok: false, stdout: "", stderr: "unsupported", exitCode: 1 };
        };
        const { service, root } = await createRepoService(commandRunner);
        await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }, null, 2), "utf8");
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "index.ts"), "export const ok = true;\n", "utf8");
        const plan = await service.getValidationPlan(root);
        expect(plan.tooling?.semgrepAvailable).toBe(true);
        expect(plan.checks.some((item) => item.id === "verify:semgrep_auto" && item.engine === "semgrep")).toBe(true);
    });
});
