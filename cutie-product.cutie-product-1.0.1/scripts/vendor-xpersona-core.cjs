/**
 * Rebuild vendor/xpersona-vscode-core-0.1.0.tgz from ../../sdk/xpersona-vscode-core (npm pack).
 * Run from the cutie-product extension root: npm run vendor:vscode-core
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sdk = path.join(root, "..", "sdk", "xpersona-vscode-core");
const outTgz = path.join(root, "vendor", "xpersona-vscode-core-0.1.0.tgz");

if (!fs.existsSync(path.join(sdk, "package.json"))) {
  console.error("Missing sdk at", sdk);
  process.exit(1);
}

fs.mkdirSync(path.join(root, "vendor"), { recursive: true });
execSync("npm run build", { cwd: sdk, stdio: "inherit" });
execSync("npm pack", { cwd: sdk, stdio: "inherit" });
const packed = path.join(sdk, "xpersona-vscode-core-0.1.0.tgz");
if (!fs.existsSync(packed)) {
  console.error("npm pack did not produce", packed);
  process.exit(1);
}
fs.copyFileSync(packed, outTgz);
fs.unlinkSync(packed);
console.log("Wrote", outTgz);
