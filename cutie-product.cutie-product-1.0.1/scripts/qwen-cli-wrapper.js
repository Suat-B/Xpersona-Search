#!/usr/bin/env node
/**
 * Wrapper for @qwen-code/sdk CLI that uses a preload to replace process.argv[1]
 * with a generic value before the CLI loads. The CLI (and OpenTelemetry) can leak
 * the executable path into the model context; using "qwen-cli" instead avoids
 * confusing the model into thinking the user asked about a file path.
 *
 * The CLI is ESM and cannot be require()d, so we spawn node with -r preload.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const preloadPath = path.join(__dirname, "qwen-cli-preload.js");
const cliPath = path.join(__dirname, "..", "node_modules", "@qwen-code", "sdk", "dist", "cli", "cli.js");

if (!fs.existsSync(preloadPath)) {
  console.error("qwen-cli-wrapper: preload not found:", preloadPath);
  process.exit(1);
}
if (!fs.existsSync(cliPath)) {
  console.error("qwen-cli-wrapper: CLI not found:", cliPath);
  process.exit(1);
}

const child = spawn(process.execPath, ["-r", preloadPath, cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

child.on("exit", (code, signal) => {
  process.exit(code != null ? code : signal ? 1 : 0);
});

child.on("error", (err) => {
  console.error("qwen-cli-wrapper:", err.message);
  process.exit(1);
});
