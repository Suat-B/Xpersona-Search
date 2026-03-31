import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliToolExecutor } from "./tool-executor.js";
function pending(step, name, args = {}) {
    return {
        step,
        adapter: "autonomy-suite",
        requiresClientExecution: true,
        createdAt: new Date().toISOString(),
        toolCall: {
            id: `${String(name)}-${step}`,
            name,
            arguments: args,
        },
    };
}
const tempDirs = [];
async function makeWorkspace() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "binary-ide-autonomy-"));
    tempDirs.push(dir);
    return dir;
}
async function executeSequence(executor, steps) {
    const results = [];
    for (const step of steps) {
        results.push(await executor.execute(pending(step.step, step.name, step.args)));
    }
    return results;
}
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
describe("Binary IDE autonomy suite", () => {
    it("repairs a failing project, validates it, and commits the result in a nested repo", async () => {
        const workspace = await makeWorkspace();
        const executor = new CliToolExecutor(workspace);
        const [mkdirResult, writePackage, writeSource, writeTest] = await executeSequence(executor, [
            { step: 1, name: "mkdir", args: { path: "duration-toolkit" } },
            {
                step: 2,
                name: "write_file",
                args: {
                    path: "package.json",
                    content: JSON.stringify({
                        name: "duration-toolkit",
                        version: "1.0.0",
                        type: "module",
                        scripts: {
                            test: "node --test",
                        },
                    }, null, 2),
                },
            },
            {
                step: 3,
                name: "write_file",
                args: {
                    path: "src/index.js",
                    content: [
                        "export function parseDuration(input) {",
                        "  const text = String(input || '').trim();",
                        "  if (text === '1h 30m') return 30 * 60 * 1000;",
                        "  if (text === '45s') return 45 * 1000;",
                        "  return 0;",
                        "}",
                        "",
                        "export function formatDuration(ms) {",
                        "  if (ms % (60 * 60 * 1000) === 0) return `${ms / (60 * 60 * 1000)}h`;",
                        "  if (ms % (60 * 1000) === 0) return `${ms / (60 * 1000)}m`;",
                        "  return `${ms}ms`;",
                        "}",
                        "",
                    ].join("\n"),
                },
            },
            {
                step: 4,
                name: "write_file",
                args: {
                    path: "test/duration.test.js",
                    content: [
                        "import test from 'node:test';",
                        "import assert from 'node:assert/strict';",
                        "import { formatDuration, parseDuration } from '../src/index.js';",
                        "",
                        "test('parseDuration supports compound hours and minutes', () => {",
                        "  assert.equal(parseDuration('1h 30m'), 90 * 60 * 1000);",
                        "});",
                        "",
                        "test('formatDuration emits whole hours', () => {",
                        "  assert.equal(formatDuration(2 * 60 * 60 * 1000), '2h');",
                        "});",
                        "",
                    ].join("\n"),
                },
            },
        ]);
        expect(mkdirResult.ok).toBe(true);
        expect(writePackage.ok).toBe(true);
        expect(writeSource.ok).toBe(true);
        expect(writeTest.ok).toBe(true);
        const failingTest = await executor.execute(pending(5, "run_command", { command: "npm test --silent" }));
        expect(failingTest.ok).toBe(false);
        expect(String(failingTest.data?.cwd)).toBe(path.join(workspace, "duration-toolkit"));
        expect(`${String(failingTest.data?.stdout || "")}\n${String(failingTest.data?.stderr || "")}`).toContain("5400000");
        expect(`${String(failingTest.data?.stdout || "")}\n${String(failingTest.data?.stderr || "")}`).toContain("1800000");
        const sourceBefore = await executor.execute(pending(6, "read_file", { path: "src/index.js", startLine: 1, endLine: 6 }));
        expect(sourceBefore.ok).toBe(true);
        expect(String(sourceBefore.data?.content)).toContain("return 30 * 60 * 1000");
        const repairEdit = await executor.execute(pending(7, "edit", {
            path: "src/index.js",
            patch: [
                "@@ -1,6 +1,6 @@",
                " export function parseDuration(input) {",
                "   const text = String(input || '').trim();",
                "-  if (text === '1h 30m') return 30 * 60 * 1000;",
                "+  if (text === '1h 30m') return 90 * 60 * 1000;",
                "   if (text === '45s') return 45 * 1000;",
                "   return 0;",
                " }",
            ].join("\n"),
        }));
        expect(repairEdit.ok).toBe(true);
        const passingTest = await executor.execute(pending(8, "run_command", { command: "npm test --silent" }));
        expect(passingTest.ok).toBe(true);
        expect(`${String(passingTest.data?.stdout || "")}\n${String(passingTest.data?.stderr || "")}`).toContain("pass");
        const gitSetupResults = await executeSequence(executor, [
            { step: 9, name: "run_command", args: { command: "git init", cwd: "duration-toolkit" } },
            {
                step: 10,
                name: "run_command",
                args: { command: 'git config user.email "binary@example.test"', cwd: "duration-toolkit" },
            },
            {
                step: 11,
                name: "run_command",
                args: { command: 'git config user.name "Binary IDE Tests"', cwd: "duration-toolkit" },
            },
            { step: 12, name: "run_command", args: { command: "git add .", cwd: "duration-toolkit" } },
            {
                step: 13,
                name: "run_command",
                args: { command: 'git commit -m "feat: duration toolkit"', cwd: "duration-toolkit" },
            },
        ]);
        expect(gitSetupResults.every((result) => result.ok)).toBe(true);
        const gitStatus = await executor.execute(pending(14, "git_status"));
        expect(gitStatus.ok).toBe(true);
        expect(String(gitStatus.data?.cwd)).toBe(path.join(workspace, "duration-toolkit"));
        expect(String(gitStatus.data?.stdout || "")).toBe("");
        const commitCount = await executor.execute(pending(15, "run_command", {
            command: 'git rev-list --count HEAD',
            cwd: "duration-toolkit",
        }));
        expect(commitCount.ok).toBe(true);
        expect(String(commitCount.data?.stdout).trim()).toBe("1");
    });
    it("uses shell commands, git diff, branching, and checkpointing across a multi-step repo workflow", async () => {
        const workspace = await makeWorkspace();
        const executor = new CliToolExecutor(workspace);
        execSync("git init", { cwd: workspace, stdio: "ignore" });
        execSync('git config user.email "binary@example.test"', { cwd: workspace, stdio: "ignore" });
        execSync('git config user.name "Binary IDE Tests"', { cwd: workspace, stdio: "ignore" });
        await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
        await fs.writeFile(path.join(workspace, "docs", "notes.md"), "first line\n", "utf8");
        execSync("git add docs/notes.md", { cwd: workspace, stdio: "ignore" });
        execSync('git commit -m "docs: seed notes"', { cwd: workspace, stdio: "ignore" });
        const branchCreate = await executor.execute(pending(1, "run_command", { command: "git checkout -b feat/autonomy-proof" }));
        expect(branchCreate.ok).toBe(true);
        const checkpoint = await executor.execute(pending(2, "create_checkpoint", { reason: "Before revising notes" }));
        expect(checkpoint.ok).toBe(true);
        const shellAppend = await executor.execute(pending(3, "run_command", {
            command: 'node -e "const fs=require(\'node:fs\'); fs.appendFileSync(\'docs/notes.md\',\'second line\\n\')"',
        }));
        expect(shellAppend.ok).toBe(true);
        const gitDiff = await executor.execute(pending(4, "git_diff", { path: "docs/notes.md" }));
        expect(gitDiff.ok).toBe(true);
        expect(String(gitDiff.data?.stdout || "")).toContain("+second line");
        const commitResults = await executeSequence(executor, [
            { step: 5, name: "run_command", args: { command: "git add docs/notes.md" } },
            {
                step: 6,
                name: "run_command",
                args: { command: 'git commit -m "docs: expand autonomy notes"' },
            },
        ]);
        expect(commitResults.every((result) => result.ok)).toBe(true);
        const finalStatus = await executor.execute(pending(7, "git_status"));
        const branchName = await executor.execute(pending(8, "run_command", { command: "git branch --show-current" }));
        const notes = await executor.execute(pending(9, "read_file", { path: "docs/notes.md", startLine: 1, endLine: 5 }));
        expect(finalStatus.ok).toBe(true);
        expect(String(finalStatus.data?.stdout || "")).toBe("");
        expect(branchName.ok).toBe(true);
        expect(String(branchName.data?.stdout).trim()).toBe("feat/autonomy-proof");
        expect(notes.ok).toBe(true);
        expect(String(notes.data?.content)).toContain("first line");
        expect(String(notes.data?.content)).toContain("second line");
    });
});
