import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliToolExecutor, inferTaskProjectRoot } from "./tool-executor.js";
async function makeWorkspace() {
    return fs.mkdtemp(path.join(os.tmpdir(), "binary-ide-cli-"));
}
async function seedWorkspace(root, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = path.join(root, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content, "utf8");
    }
}
function toolCall(name, args = {}, id = `${String(name)}-1`) {
    return {
        step: 1,
        adapter: "test",
        requiresClientExecution: true,
        toolCall: {
            id,
            name,
            arguments: args,
        },
        createdAt: new Date().toISOString(),
    };
}
const tempDirs = [];
afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
describe("inferTaskProjectRoot", () => {
    it("extracts project folder names from natural language tasks", () => {
        expect(inferTaskProjectRoot("Create a new project folder named duration-toolkit")).toBe("duration-toolkit");
        expect(inferTaskProjectRoot("Add a folder named api-core in the current workspace")).toBe("api-core");
        expect(inferTaskProjectRoot("Inspect hello.py and explain it")).toBeNull();
    });
});
describe("CliToolExecutor", () => {
    it("lists workspace files and skips ignored directories", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/index.ts": "export const ok = true;\n",
            "notes/todo.md": "- item\n",
            "node_modules/leftpad/index.js": "module.exports = {};\n",
            ".git/HEAD": "ref: refs/heads/main\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("list_files", { limit: 10 }));
        expect(result.ok).toBe(true);
        expect(result.data?.files).toEqual(["notes/todo.md", "src/index.ts"]);
    });
    it("reads a file range from the workspace", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/hello.ts": ["one", "two", "three", "four"].join("\n"),
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("read_file", { path: "src/hello.ts", startLine: 2, endLine: 3 }));
        expect(result.ok).toBe(true);
        expect(result.summary).toContain("src/hello.ts (2-3)");
        expect(result.data).toMatchObject({
            path: "src/hello.ts",
            range: "2-3",
            content: ["two", "three"].join("\n"),
            lineCount: 4,
        });
    });
    it("suggests a nearby file when read_file misses", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "docs/README.md": "hello\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("read_file", { path: "README.md" }));
        expect(result.ok).toBe(false);
        expect(result.summary).toContain("Did you mean docs/README.md?");
    });
    it("searches the workspace with ripgrep", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/main.ts": "const TOKEN = 'needle-value';\n",
            "docs/guide.md": "needle-value appears here too\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("search_workspace", { query: "needle-value", limit: 2 }));
        expect(result.ok).toBe(true);
        expect(result.data?.matches).toEqual([
            expect.objectContaining({ path: "docs/guide.md", content: "needle-value appears here too" }),
            expect.objectContaining({ path: "src/main.ts", content: "const TOKEN = 'needle-value';" }),
        ]);
    });
    it("tracks an observed root and rewrites new paths into that project", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        const executor = new CliToolExecutor(workspace);
        const mkdirResult = await executor.execute(toolCall("mkdir", { path: "duration-toolkit" }));
        const writeResult = await executor.execute(toolCall("write_file", { path: "src/index.ts", content: "export const value = 1;\n" }));
        const written = await fs.readFile(path.join(workspace, "duration-toolkit", "src", "index.ts"), "utf8");
        expect(mkdirResult.ok).toBe(true);
        expect(writeResult.ok).toBe(true);
        expect(writeResult.data?.path).toBe("duration-toolkit/src/index.ts");
        expect(written).toBe("export const value = 1;\n");
    });
    it("refuses to overwrite an existing file when overwrite is false", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/index.ts": "export const value = 1;\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("write_file", {
            path: "src/index.ts",
            content: "export const value = 2;\n",
            overwrite: false,
        }));
        expect(result.ok).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.summary).toContain("Refused to overwrite src/index.ts");
    });
    it("applies edit patches to existing files", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/index.ts": "export const value = 1;\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("edit", {
            path: "src/index.ts",
            patch: ["@@ -1,1 +1,1 @@", "-export const value = 1;", "+export const value = 2;"].join("\n"),
        }));
        const updated = await fs.readFile(path.join(workspace, "src", "index.ts"), "utf8");
        expect(result.ok).toBe(true);
        expect(result.data).toMatchObject({
            path: "src/index.ts",
            hunksApplied: 1,
            totalHunks: 1,
        });
        expect(updated).toBe("export const value = 2;\n");
    });
    it("suggests a likely path when edit targets a missing file", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "src/hello.ts": "console.log('hi');\n",
        });
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("edit", {
            path: "hello.ts",
            patch: ["@@ -1,1 +1,1 @@", "-console.log('hi');", "+console.log('hello');"].join("\n"),
        }));
        expect(result.ok).toBe(false);
        expect(result.summary).toContain("Did you mean src/hello.ts?");
    });
    it("captures git status and git diff from the workspace", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "tracked.txt": "before\n",
        });
        execSync("git init", { cwd: workspace, stdio: "ignore" });
        execSync('git config user.email "binary@example.test"', { cwd: workspace, stdio: "ignore" });
        execSync('git config user.name "Binary IDE Tests"', { cwd: workspace, stdio: "ignore" });
        execSync("git add tracked.txt", { cwd: workspace, stdio: "ignore" });
        execSync('git commit -m "init"', { cwd: workspace, stdio: "ignore" });
        await fs.writeFile(path.join(workspace, "tracked.txt"), "after\n", "utf8");
        const executor = new CliToolExecutor(workspace);
        const statusResult = await executor.execute(toolCall("git_status"));
        const diffResult = await executor.execute(toolCall("git_diff", { path: "tracked.txt" }));
        expect(statusResult.ok).toBe(true);
        expect(String(statusResult.data?.stdout || "")).toContain("M tracked.txt");
        expect(diffResult.ok).toBe(true);
        expect(String(diffResult.data?.stdout || "")).toContain("-before");
        expect(String(diffResult.data?.stdout || "")).toContain("+after");
    });
    it("infers command cwd from the preferred project root and explicit cwd", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        await seedWorkspace(workspace, {
            "duration-toolkit/src/index.ts": "export {};\n",
        });
        const executor = new CliToolExecutor(workspace, "duration-toolkit");
        const defaultCwdResult = await executor.execute(toolCall("run_command", {
            command: 'node -e "process.stdout.write(process.cwd())"',
        }));
        const explicitCwdResult = await executor.execute(toolCall("run_command", {
            command: 'node -e "process.stdout.write(process.cwd())"',
            cwd: "src",
        }));
        expect(defaultCwdResult.ok).toBe(true);
        expect(defaultCwdResult.data?.cwd).toBe(path.join(workspace, "duration-toolkit"));
        expect(String(defaultCwdResult.data?.stdout)).toBe(path.join(workspace, "duration-toolkit"));
        expect(explicitCwdResult.ok).toBe(true);
        expect(explicitCwdResult.data?.cwd).toBe(path.join(workspace, "duration-toolkit", "src"));
        expect(String(explicitCwdResult.data?.stdout)).toBe(path.join(workspace, "duration-toolkit", "src"));
    });
    it("returns placeholder results for checkpoint, memory, and diagnostics tools", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        const executor = new CliToolExecutor(workspace);
        const checkpoint = await executor.execute(toolCall("create_checkpoint", { reason: "Before edits" }));
        const memory = await executor.execute(toolCall("get_workspace_memory"));
        const diagnostics = await executor.execute(toolCall("get_diagnostics"));
        expect(checkpoint).toMatchObject({
            ok: true,
            summary: "Checkpoint noted: Before edits.",
            data: { reason: "Before edits" },
        });
        expect(memory).toMatchObject({
            ok: true,
            data: { memory: null },
        });
        expect(diagnostics).toMatchObject({
            ok: true,
            data: { diagnostics: [] },
        });
    });
    it("rejects unsupported tools", async () => {
        const workspace = await makeWorkspace();
        tempDirs.push(workspace);
        const executor = new CliToolExecutor(workspace);
        const result = await executor.execute(toolCall("teleport_file"));
        expect(result.ok).toBe(false);
        expect(result.summary).toContain("Unsupported tool teleport_file");
    });
});
