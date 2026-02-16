#!/usr/bin/env node
/**
 * Setup Google Sign-In for Xpersona — hands-off, one-run flow.
 * Run: npm run setup:google
 *
 * 1. Opens Google Cloud Console in your browser
 * 2. Prompts for Client ID and Secret
 * 3. Writes .env.local
 * 4. Prints redirect URIs to add
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { execSync, spawn } from "child_process";

const ENV_LOCAL = ".env.local";
const ENV_EXAMPLE = ".env.example";

const CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";

function open(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    console.log(`\nOpen manually: ${url}\n`);
  }
}

function readEnvLocal() {
  if (!existsSync(ENV_LOCAL)) return "";
  return readFileSync(ENV_LOCAL, "utf8");
}

function writeEnvLocal(content) {
  writeFileSync(ENV_LOCAL, content, "utf8");
}

function ensureEnvLocal() {
  if (!existsSync(ENV_LOCAL)) {
    const example = existsSync(ENV_EXAMPLE) ? readFileSync(ENV_EXAMPLE, "utf8") : "";
    writeEnvLocal(example || "# Xpersona .env.local\n");
    console.log("Created .env.local from .env.example");
  }
}

function getBaseUrl() {
  try {
    const content = readEnvLocal();
    const m = content.match(/NEXTAUTH_URL=(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return "http://localhost:3000";
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n  Xpersona — Google Sign-In Setup\n");
  console.log("  This will open the Google Cloud Console so you can create OAuth credentials.");
  console.log("  You only need to do this once.\n");

  open(CONSOLE_URL);

  console.log("  Steps in Google Cloud Console:");
  console.log("  1. Create or select a project");
  console.log("  2. Go to APIs & Services → Credentials");
  console.log("  3. Create Credentials → OAuth client ID");
  console.log("  4. Application type: Web application");
  console.log("  5. Authorized redirect URIs: add the URIs printed below");
  console.log("  6. Copy Client ID and Client Secret\n");

  const baseUrl = getBaseUrl();
  const callbackUri = `${baseUrl.replace(/\/$/, "")}/api/auth/callback/google`;

  console.log(`  Add this redirect URI in Google Console:\n    ${callbackUri}\n`);

  const clientId = await prompt("  Paste Client ID (or press Enter to skip): ");
  if (!clientId) {
    console.log("\n  Skipped. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local manually.");
    process.exit(0);
  }

  const clientSecret = await prompt("  Paste Client Secret: ");
  if (!clientSecret) {
    console.log("\n  Client Secret required. Add both to .env.local manually.");
    process.exit(1);
  }

  ensureEnvLocal();
  let content = readEnvLocal();

  const setVar = (key, value) => {
    const line = `${key}=${String(value).replace(/\n/g, "")}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content = content.trimEnd() + `\n${line}\n`;
    }
  };

  setVar("GOOGLE_CLIENT_ID", clientId);
  setVar("GOOGLE_CLIENT_SECRET", clientSecret);

  writeEnvLocal(content);

  console.log("\n  Done. Added GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local");
  console.log("\n  Next: restart your dev server (npm run dev)");
  console.log("  The Upgrade to Google button will now work.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
