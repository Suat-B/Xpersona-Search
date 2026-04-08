import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as asar from "@electron/asar";

const { extractAll } = asar;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const compatRendererDir = path.join(packageRoot, "dist", "renderer-codex");
const tempExtractRoot = path.join(packageRoot, "dist", ".codex-extract-tmp");

function parseVersionFromWindowsAppDir(entryName) {
  const match = entryName.match(/^OpenAI\.Codex_([^_]+)_/i);
  if (!match) return [];
  return match[1].split(".").map((part) => Number(part));
}

function compareVersion(a, b) {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return -1;
    if (left < right) return 1;
  }
  return 0;
}

async function resolveCodexAsarPath() {
  const explicitAsar = process.env.BINARY_IDE_CODEX_ASAR;
  if (explicitAsar && existsSync(explicitAsar)) return explicitAsar;

  const explicitAppDir = process.env.BINARY_IDE_CODEX_APP_DIR;
  if (explicitAppDir) {
    const candidate = path.join(explicitAppDir, "resources", "app.asar");
    if (existsSync(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    try {
      const installLocation = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "(Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1 -ExpandProperty InstallLocation)",
        ],
        { encoding: "utf8" },
      ).trim();
      if (installLocation) {
        const asarPath = path.join(installLocation, "app", "resources", "app.asar");
        if (existsSync(asarPath)) return asarPath;
      }
    } catch {
      // Fall through to directory probing.
    }

    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const windowsAppsDir = path.join(programFiles, "WindowsApps");
    try {
      const entries = await readdir(windowsAppsDir, { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("OpenAI.Codex_"))
        .sort((left, right) => compareVersion(parseVersionFromWindowsAppDir(left.name), parseVersionFromWindowsAppDir(right.name)));
      for (const entry of candidates) {
        const asarPath = path.join(windowsAppsDir, entry.name, "app", "resources", "app.asar");
        if (existsSync(asarPath)) return asarPath;
      }
    } catch {
      // Continue to other candidate locations.
    }
  }

  const localProgramAsar = path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Codex",
    "resources",
    "app.asar",
  );
  if (existsSync(localProgramAsar)) return localProgramAsar;

  return null;
}

async function resolveFallbackWebviewDir() {
  const explicitFallback = process.env.BINARY_IDE_CODEX_WEBVIEW_FALLBACK_DIR;
  if (explicitFallback && existsSync(explicitFallback)) {
    return explicitFallback;
  }

  const candidates = [
    path.join(repoRoot, "tmp-codex-rebuild-ref", "src", "webview"),
    path.join(repoRoot, "tmp-codex-rebuild-ref", "src", "win", "webview"),
    path.join(repoRoot, "tmp-codex-rebuild-ref", "src", "unix", "webview"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function validateCompatRendererOutput(compatDir) {
  const compatIndexPath = path.join(compatDir, "index.html");
  if (!existsSync(compatIndexPath)) {
    throw new Error(`Compat renderer is missing index.html at ${compatIndexPath}`);
  }

  const assetsDir = path.join(compatDir, "assets");
  if (!existsSync(assetsDir)) {
    throw new Error(`Compat renderer is missing assets directory at ${assetsDir}`);
  }
  const assetFiles = await readdir(assetsDir);
  if (assetFiles.length === 0) {
    throw new Error(`Compat renderer assets directory is empty: ${assetsDir}`);
  }

  const html = await readFile(compatIndexPath, "utf8");
  const moduleScriptMatch = html.match(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i);
  if (!moduleScriptMatch?.[1]) {
    throw new Error("Compat renderer index.html is missing a module script entry.");
  }
  const entryRelativePath = moduleScriptMatch[1].replace(/^\.\//, "").replace(/^\/+/, "");
  const entryPath = path.join(compatDir, entryRelativePath);
  if (!existsSync(entryPath)) {
    throw new Error(`Compat renderer module entry file not found: ${entryPath}`);
  }
}

async function applyBinaryBranding(compatDir) {
  const compatIndexPath = path.join(compatDir, "index.html");
  if (!existsSync(compatIndexPath)) return;

  let html = await readFile(compatIndexPath, "utf8");
  // Strip massive preloads to avoid main-frame startup stalls in compat mode.
  html = html.replace(/^\s*<link rel="modulepreload"[^\n]*\n/gm, "");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Binary IDE</title>");
  html = html.replace(/^\s*<script src="\.\/binary-branding\.js"><\/script>\s*$/gm, "");
  await writeFile(compatIndexPath, html, "utf8");
}

async function applyCompatRuntimeHotfixes(compatDir) {
  const assetsDir = path.join(compatDir, "assets");
  if (!existsSync(assetsDir)) return;

  const files = await readdir(assetsDir);
  const vscodeApiBundle = files.find((name) => /^vscode-api-.*\.js$/i.test(name));
  if (!vscodeApiBundle) return;

  const vscodeApiPath = path.join(assetsDir, vscodeApiBundle);
  let js = await readFile(vscodeApiPath, "utf8");
  const semverThrow = "if(t?.groups==null)throw Error(`Invalid semantic version: ${e}`);";
  const semverFallback = "if(t?.groups==null)return{suffix:\"\",version:{major:0,minor:0,patch:0}};";
  if (js.includes(semverThrow)) {
    js = js.replace(semverThrow, semverFallback);
    await writeFile(vscodeApiPath, js, "utf8");
    console.log(`[binary-ide-desktop] Applied compat semver hotfix in ${vscodeApiBundle}`);
  }

  const authBundle = files.find((name) => /^use-auth-.*\.js$/i.test(name));
  if (!authBundle) return;

  const authBundlePath = path.join(assetsDir, authBundle);
  let authJs = await readFile(authBundlePath, "utf8");
  const authDefaultState =
    "openAIAuth:null,authMethod:null,requiresAuth:!0,email:null,planAtLogin:null";
  const authDefaultBypass =
    "openAIAuth:`apikey`,authMethod:`apikey`,requiresAuth:!1,email:null,planAtLogin:null";
  const authRequiresFlag = "requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0)";
  const authRequiresBypass = "requiresAuth:!1";
  let authPatched = false;

  if (authJs.includes(authDefaultState)) {
    authJs = authJs.split(authDefaultState).join(authDefaultBypass);
    authPatched = true;
  }
  if (authJs.includes(authRequiresFlag)) {
    authJs = authJs.replace(authRequiresFlag, authRequiresBypass);
    authPatched = true;
  }

  if (authPatched) {
    await writeFile(authBundlePath, authJs, "utf8");
    console.log(`[binary-ide-desktop] Applied compat auth-skip hotfix in ${authBundle}`);
  }
}

await rm(compatRendererDir, { recursive: true, force: true });
await mkdir(compatRendererDir, { recursive: true });

const codexAsarPath = await resolveCodexAsarPath();
let sourceLabel = "";

if (codexAsarPath) {
  await rm(tempExtractRoot, { recursive: true, force: true });
  await mkdir(tempExtractRoot, { recursive: true });
  try {
    extractAll(codexAsarPath, tempExtractRoot);
    const codexWebviewDir = path.join(tempExtractRoot, "webview");
    if (!existsSync(codexWebviewDir)) {
      throw new Error(`Extracted Codex package missing webview directory: ${codexWebviewDir}`);
    }
    await cp(codexWebviewDir, compatRendererDir, {
      recursive: true,
      force: true,
    });
    sourceLabel = `app.asar:${codexAsarPath}`;
  } finally {
    await rm(tempExtractRoot, { recursive: true, force: true });
  }
} else {
  const fallbackWebviewDir = await resolveFallbackWebviewDir();
  if (!fallbackWebviewDir) {
    throw new Error(
      [
        "[binary-ide-desktop] Could not find Codex renderer source.",
        "Primary source: installed Codex app.asar (set BINARY_IDE_CODEX_ASAR to override).",
        "Secondary source: upstream-synced webview directory (set BINARY_IDE_CODEX_WEBVIEW_FALLBACK_DIR).",
      ].join(" "),
    );
  }
  await cp(fallbackWebviewDir, compatRendererDir, {
    recursive: true,
    force: true,
  });
  sourceLabel = `fallback-webview:${fallbackWebviewDir}`;
}

await validateCompatRendererOutput(compatRendererDir);
await applyBinaryBranding(compatRendererDir);
await applyCompatRuntimeHotfixes(compatRendererDir);
console.log(`[binary-ide-desktop] Copied Codex compat renderer from ${sourceLabel}`);
