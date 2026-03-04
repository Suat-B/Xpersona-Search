#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { PlaygroundClient } from "./client.js";
import { clearApiKey, getApiKey, getConfigPath, loadConfig, saveConfig } from "./config.js";
import { CliHttpError } from "./http.js";
const execAsync = promisify(exec);
const HELP = `Playground AI CLI - Agentic coding runtime

Usage:
  playground <command> [options]

Core commands:
  playground chat                         Interactive chat with streaming
  playground run "<task>"                One-shot task execution
  playground sessions list [--limit 20]
  playground sessions show <sessionId>
  playground usage
  playground checkout [--tier builder] [--billing monthly]

Auth/config:
  playground auth set-key [API_KEY]
  playground auth clear
  playground auth status
  playground config set-base-url <url>
  playground config show

Execution/index:
  playground replay <sessionId> [--mode plan]
  playground execute --file actions.json [--session <id>]
  playground index upsert --project <key> [--path .]
  playground index query --project <key> "<question>"

Flags:
  --mode auto|plan|yolo|generate|debug
  --model "Playground AI"
  --help
`;
function parseArgs(args) {
    const positionals = [];
    const flags = {};
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg.startsWith("-")) {
            positionals.push(arg);
            continue;
        }
        if (arg.startsWith("--")) {
            const keyValue = arg.slice(2);
            const eqIndex = keyValue.indexOf("=");
            if (eqIndex >= 0) {
                flags[keyValue.slice(0, eqIndex)] = keyValue.slice(eqIndex + 1);
            }
            else {
                const next = args[i + 1];
                if (next && !next.startsWith("-")) {
                    flags[keyValue] = next;
                    i += 1;
                }
                else {
                    flags[keyValue] = true;
                }
            }
            continue;
        }
        const key = arg.slice(1);
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
            flags[key] = next;
            i += 1;
        }
        else {
            flags[key] = true;
        }
    }
    return { positionals, flags };
}
function getFlagString(parsed, name, short) {
    const value = parsed.flags[name] ?? (short ? parsed.flags[short] : undefined);
    return typeof value === "string" ? value : undefined;
}
function isHelp(parsed) {
    return Boolean(parsed.flags.help || parsed.flags.h || parsed.positionals[0] === "help");
}
function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function workspaceFingerprint(input = process.cwd()) {
    return createHash("sha256").update(input).digest("hex").slice(0, 32);
}
function parseMode(value, fallback) {
    if (!value)
        return fallback;
    if (value === "auto" || value === "plan" || value === "yolo" || value === "generate" || value === "debug") {
        return value;
    }
    throw new Error(`Invalid mode '${value}'. Use auto|plan|yolo|generate|debug.`);
}
function requireApiKey(config) {
    const key = getApiKey(config);
    if (!key) {
        throw new Error("No API key configured. Run 'playground auth set-key' or set PLAYGROUND_AI_API_KEY.");
    }
    return key;
}
async function maybeOpenBrowser(url) {
    try {
        if (process.platform === "win32") {
            await execAsync(`start "" "${url}"`);
            return;
        }
        if (process.platform === "darwin") {
            await execAsync(`open "${url}"`);
            return;
        }
        await execAsync(`xdg-open "${url}"`);
    }
    catch {
        // Ignore browser-open failures and still show URL.
    }
}
function asObject(value) {
    return value && typeof value === "object" ? value : {};
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function getData(payload) {
    const obj = asObject(payload);
    if (obj.success === true && "data" in obj)
        return obj.data;
    return payload;
}
async function streamPrompt(client, input) {
    let sessionId;
    let printedToken = false;
    let printedFinal = false;
    await client.assistStream(input, (event) => {
        if (!event || typeof event !== "object")
            return;
        const ev = typeof event.event === "string" ? event.event : "";
        if (typeof event.sessionId === "string") {
            sessionId = event.sessionId;
        }
        if (ev === "log") {
            const logSession = typeof event.sessionId === "string" ? event.sessionId : "";
            if (logSession)
                sessionId = logSession;
            const logMessage = typeof event.message === "string"
                ? event.message
                : JSON.stringify(event.data ?? event);
            process.stdout.write(`\n[ran] ${logMessage}`);
            return;
        }
        if (ev === "status") {
            process.stdout.write(`\n[status] ${String(event.data ?? "")}`);
            return;
        }
        if (ev === "phase") {
            const data = asObject(event.data);
            const phaseName = typeof data.name === "string" ? data.name : "phase";
            process.stdout.write(`\n[phase] ${phaseName}`);
            return;
        }
        if (ev === "decision") {
            const data = asObject(event.data);
            const mode = typeof data.mode === "string" ? data.mode : "unknown";
            process.stdout.write(`\n[decision] ${mode}`);
            return;
        }
        if (ev === "token") {
            printedToken = true;
            process.stdout.write(String(event.data ?? ""));
            return;
        }
        if (ev === "final") {
            const finalText = String(event.data ?? "");
            if (!printedToken)
                process.stdout.write(finalText);
            printedFinal = true;
            process.stdout.write("\n");
            return;
        }
    });
    if (!printedFinal)
        process.stdout.write("\n");
    return { sessionId };
}
async function handleAuth(parsed, config) {
    const sub = parsed.positionals[1];
    if (!sub || sub === "status") {
        const key = getApiKey(config);
        const masked = key ? `${key.slice(0, 6)}...${key.slice(-4)}` : "(not set)";
        console.log(`Playground AI API key: ${masked}`);
        console.log(`Config file: ${getConfigPath()}`);
        return;
    }
    if (sub === "set-key") {
        const provided = parsed.positionals[2] || getFlagString(parsed, "key", "k");
        let key = provided;
        if (!key) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            key = (await rl.question("Enter Playground AI API key: ")).trim();
            rl.close();
        }
        if (!key)
            throw new Error("API key is empty.");
        const next = { ...config, apiKey: key.trim() };
        await saveConfig(next);
        console.log("Saved API key for Playground AI CLI.");
        return;
    }
    if (sub === "clear") {
        await clearApiKey(config);
        console.log("Cleared stored API key.");
        return;
    }
    throw new Error(`Unknown auth subcommand '${sub}'.`);
}
async function handleConfig(parsed, config) {
    const sub = parsed.positionals[1];
    if (!sub || sub === "show") {
        printJson(config);
        return;
    }
    if (sub === "set-base-url") {
        const url = parsed.positionals[2];
        if (!url)
            throw new Error("Usage: playground config set-base-url <url>");
        const next = { ...config, baseUrl: url.replace(/\/+$/, "") };
        await saveConfig(next);
        console.log(`Base URL set to ${next.baseUrl}`);
        return;
    }
    if (sub === "set-model") {
        const model = parsed.positionals[2];
        if (!model)
            throw new Error("Usage: playground config set-model <model>");
        const next = { ...config, model };
        await saveConfig(next);
        console.log(`Default model set to ${model}`);
        return;
    }
    throw new Error(`Unknown config subcommand '${sub}'.`);
}
async function handleChat(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
    const model = getFlagString(parsed, "model") ?? config.model ?? "Playground AI";
    let sessionId;
    try {
        sessionId = (await client.createSession("Playground AI CLI Chat", mode)) || undefined;
    }
    catch {
        sessionId = undefined;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let activeMode = mode;
    console.log("Playground AI CLI chat started.");
    console.log("Commands: /exit, /help, /mode <auto|plan|yolo|generate|debug>, /usage, /checkout");
    while (true) {
        const prompt = `Playground AI [${activeMode}] > `;
        const line = (await rl.question(prompt)).trim();
        if (!line)
            continue;
        if (line === "/exit" || line === "/quit")
            break;
        if (line === "/help") {
            console.log("Type your prompt and press Enter to send.");
            console.log("Use /mode <value> to switch mode.");
            continue;
        }
        if (line.startsWith("/mode ")) {
            const nextMode = line.slice(6).trim();
            activeMode = parseMode(nextMode, activeMode);
            console.log(`[mode] ${activeMode}`);
            continue;
        }
        if (line === "/usage") {
            const usage = await client.usage();
            printJson(getData(usage));
            continue;
        }
        if (line === "/checkout") {
            const checkout = asObject(getData(await client.checkout("builder", "monthly")));
            const url = typeof checkout.url === "string" ? checkout.url : "";
            if (url) {
                console.log(`Checkout URL: ${url}`);
                await maybeOpenBrowser(url);
            }
            else {
                printJson(checkout);
            }
            continue;
        }
        const result = await streamPrompt(client, {
            task: line,
            mode: activeMode,
            model,
            historySessionId: sessionId,
        });
        if (result.sessionId)
            sessionId = result.sessionId;
    }
    rl.close();
}
async function handleRun(parsed, config) {
    const apiKey = requireApiKey(config);
    const task = parsed.positionals.slice(1).join(" ").trim();
    if (!task)
        throw new Error("Usage: playground run \"<task>\"");
    const mode = parseMode(getFlagString(parsed, "mode", "m"), config.mode ?? "auto");
    const model = getFlagString(parsed, "model") ?? config.model ?? "Playground AI";
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    await streamPrompt(client, { task, mode, model });
}
async function handleSessions(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const sub = parsed.positionals[1];
    if (!sub || sub === "list") {
        const limitRaw = getFlagString(parsed, "limit", "l");
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
        const response = getData(await client.listSessions(Number.isFinite(limit) ? limit : 20));
        const root = asObject(response);
        const rows = asArray(root.data);
        if (!rows.length) {
            console.log("No sessions found.");
            return;
        }
        for (const row of rows) {
            const item = asObject(row);
            const id = typeof item.id === "string" ? item.id : "(unknown)";
            const mode = typeof item.mode === "string" ? item.mode : "auto";
            const title = typeof item.title === "string" && item.title.trim() ? item.title : "(untitled)";
            const updated = typeof item.updatedAt === "string" ? item.updatedAt : "";
            console.log(`${id}  [${mode}]  ${title}${updated ? `  ${updated}` : ""}`);
        }
        return;
    }
    if (sub === "show") {
        const sessionId = parsed.positionals[2];
        if (!sessionId)
            throw new Error("Usage: playground sessions show <sessionId>");
        const response = getData(await client.getSessionMessages(sessionId, true));
        const rows = asArray(response).slice().reverse();
        for (const row of rows) {
            const item = asObject(row);
            const role = typeof item.role === "string" ? item.role : "assistant";
            const content = typeof item.content === "string" ? item.content : "";
            const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
            console.log(`\n[${role}] ${createdAt}`);
            console.log(content);
        }
        return;
    }
    throw new Error(`Unknown sessions subcommand '${sub}'.`);
}
async function handleUsage(config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const response = getData(await client.usage());
    printJson(response);
}
async function handleCheckout(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const tier = getFlagString(parsed, "tier") ?? "builder";
    const billing = getFlagString(parsed, "billing") ?? "monthly";
    if (!["starter", "builder", "studio"].includes(tier)) {
        throw new Error("Invalid --tier. Use starter|builder|studio.");
    }
    if (!["monthly", "yearly"].includes(billing)) {
        throw new Error("Invalid --billing. Use monthly|yearly.");
    }
    const response = asObject(getData(await client.checkout(tier, billing)));
    const url = typeof response.url === "string" ? response.url : "";
    if (!url) {
        printJson(response);
        return;
    }
    console.log(`Playground AI checkout URL (${tier}/${billing}):`);
    console.log(url);
    await maybeOpenBrowser(url);
}
async function handleReplay(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const sessionId = parsed.positionals[1];
    if (!sessionId)
        throw new Error("Usage: playground replay <sessionId> [--mode plan]");
    const mode = parseMode(getFlagString(parsed, "mode", "m"), "plan");
    const fingerprint = getFlagString(parsed, "workspace") ?? workspaceFingerprint();
    const response = getData(await client.replay(sessionId, fingerprint, mode));
    printJson(response);
}
function parseExecuteActions(value) {
    const root = asObject(value);
    const maybeActions = Array.isArray(root.actions) ? root.actions : Array.isArray(value) ? value : [];
    const actions = [];
    for (const raw of maybeActions) {
        const item = asObject(raw);
        const type = item.type;
        if (type === "command" && typeof item.command === "string") {
            actions.push({
                type,
                command: item.command,
                cwd: typeof item.cwd === "string" ? item.cwd : undefined,
                timeoutMs: typeof item.timeoutMs === "number" ? item.timeoutMs : undefined,
            });
            continue;
        }
        if (type === "edit" && typeof item.path === "string") {
            actions.push({
                type,
                path: item.path,
                patch: typeof item.patch === "string" ? item.patch : undefined,
                diff: typeof item.diff === "string" ? item.diff : undefined,
            });
            continue;
        }
        if (type === "rollback" && typeof item.snapshotId === "string") {
            actions.push({ type, snapshotId: item.snapshotId });
        }
    }
    return actions;
}
async function handleExecute(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const filePath = getFlagString(parsed, "file", "f");
    if (!filePath)
        throw new Error("Usage: playground execute --file actions.json [--session <id>]");
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    const parsedJson = JSON.parse(raw);
    const actions = parseExecuteActions(parsedJson);
    if (!actions.length)
        throw new Error("No valid actions found in input file.");
    const sessionId = getFlagString(parsed, "session");
    const fingerprint = getFlagString(parsed, "workspace") ?? workspaceFingerprint();
    const response = getData(await client.execute(sessionId, fingerprint, actions));
    printJson(response);
}
function isTextFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const allow = new Set([
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".py",
        ".md",
        ".json",
        ".yaml",
        ".yml",
        ".txt",
        ".go",
        ".rs",
        ".java",
        ".kt",
        ".c",
        ".cc",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".sh",
        ".sql",
    ]);
    return allow.has(ext);
}
async function collectFiles(root, maxFiles) {
    const out = [];
    const skip = new Set([".git", ".next", "node_modules", "dist", "build", "__pycache__", ".cache"]);
    const stack = [root];
    while (stack.length && out.length < maxFiles) {
        const current = stack.pop();
        const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (out.length >= maxFiles)
                break;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!skip.has(entry.name))
                    stack.push(full);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!isTextFile(full))
                continue;
            out.push(full);
        }
    }
    return out;
}
function chunkText(input, chunkSize) {
    if (input.length <= chunkSize)
        return [input];
    const chunks = [];
    let idx = 0;
    while (idx < input.length) {
        chunks.push(input.slice(idx, idx + chunkSize));
        idx += chunkSize;
    }
    return chunks;
}
async function handleIndex(parsed, config) {
    const apiKey = requireApiKey(config);
    const client = new PlaygroundClient({ baseUrl: config.baseUrl, apiKey });
    const sub = parsed.positionals[1];
    const project = getFlagString(parsed, "project", "p");
    if (!project)
        throw new Error("Missing --project <key>.");
    if (!sub || sub === "upsert") {
        const sourcePath = path.resolve(getFlagString(parsed, "path") ?? ".");
        const maxFilesRaw = getFlagString(parsed, "max-files");
        const chunkSizeRaw = getFlagString(parsed, "chunk-size");
        const maxFiles = maxFilesRaw ? Number.parseInt(maxFilesRaw, 10) : 120;
        const chunkSize = chunkSizeRaw ? Number.parseInt(chunkSizeRaw, 10) : 3000;
        const files = await collectFiles(sourcePath, Number.isFinite(maxFiles) ? maxFiles : 120);
        if (!files.length) {
            console.log("No files found to index.");
            return;
        }
        const chunks = [];
        for (const filePath of files) {
            const raw = await fs.readFile(filePath, "utf8").catch(() => "");
            if (!raw.trim())
                continue;
            const relative = path.relative(sourcePath, filePath);
            const fileChunks = chunkText(raw, Number.isFinite(chunkSize) ? chunkSize : 3000);
            for (let i = 0; i < fileChunks.length; i += 1) {
                const chunk = fileChunks[i];
                const pathHash = createHash("sha256").update(relative).digest("hex");
                const chunkHash = createHash("sha256").update(`${relative}:${i}:${chunk}`).digest("hex");
                chunks.push({
                    pathHash,
                    chunkHash,
                    pathDisplay: relative,
                    content: chunk,
                    metadata: {
                        chunkIndex: i,
                        totalChunks: fileChunks.length,
                        source: "playground-ai-cli",
                    },
                });
            }
        }
        if (!chunks.length) {
            console.log("No text content found to index.");
            return;
        }
        const batchSize = 100;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            await client.indexUpsert(project, batch);
            console.log(`[index] upserted ${Math.min(i + batch.length, chunks.length)}/${chunks.length} chunks`);
        }
        return;
    }
    if (sub === "query") {
        const question = parsed.positionals.slice(2).join(" ").trim();
        if (!question)
            throw new Error("Usage: playground index query --project <key> \"<question>\"");
        const limitRaw = getFlagString(parsed, "limit", "l");
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 8;
        const response = getData(await client.indexQuery(project, question, Number.isFinite(limit) ? limit : 8));
        printJson(response);
        return;
    }
    throw new Error(`Unknown index subcommand '${sub}'.`);
}
async function run() {
    const parsed = parseArgs(process.argv.slice(2));
    if (process.argv.length <= 2 || isHelp(parsed)) {
        console.log(HELP);
        return;
    }
    const command = parsed.positionals[0];
    const config = await loadConfig();
    if (command === "auth") {
        await handleAuth(parsed, config);
        return;
    }
    if (command === "config") {
        await handleConfig(parsed, config);
        return;
    }
    if (command === "chat") {
        await handleChat(parsed, config);
        return;
    }
    if (command === "run") {
        await handleRun(parsed, config);
        return;
    }
    if (command === "sessions") {
        await handleSessions(parsed, config);
        return;
    }
    if (command === "usage") {
        await handleUsage(config);
        return;
    }
    if (command === "checkout") {
        await handleCheckout(parsed, config);
        return;
    }
    if (command === "replay") {
        await handleReplay(parsed, config);
        return;
    }
    if (command === "execute") {
        await handleExecute(parsed, config);
        return;
    }
    if (command === "index") {
        await handleIndex(parsed, config);
        return;
    }
    throw new Error(`Unknown command '${command}'. Run 'playground --help'.`);
}
run().catch((error) => {
    if (error instanceof CliHttpError) {
        console.error(`Playground AI request failed (${error.status}): ${error.message}`);
        if (error.details)
            printJson(error.details);
        process.exit(1);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
