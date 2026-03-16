import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const files = fs
  .readdirSync(cwd)
  .filter((name) => name.endsWith(".vsix"))
  .map((name) => ({
    name,
    fullPath: path.join(cwd, name),
    mtimeMs: fs.statSync(path.join(cwd, name)).mtimeMs,
  }))
  .sort((left, right) => right.mtimeMs - left.mtimeMs);

if (!files.length) {
  throw new Error("No .vsix package found in the current directory.");
}

const latest = files[0];
const buffer = fs.readFileSync(latest.fullPath);

function findEndOfCentralDirectory(zipBuffer) {
  for (let index = zipBuffer.length - 22; index >= 0; index -= 1) {
    if (zipBuffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }
  throw new Error(`Could not locate the ZIP central directory for ${latest.name}.`);
}

const eocdOffset = findEndOfCentralDirectory(buffer);
const fileCount = buffer.readUInt16LE(eocdOffset + 10);
const sizeBytes = buffer.length;
const sizeMb = Number((sizeBytes / (1024 * 1024)).toFixed(2));

const maxBytes = Number(process.env.MAX_VSIX_BYTES || 0);
const maxFiles = Number(process.env.MAX_VSIX_FILES || 0);

console.log(
  JSON.stringify(
    {
      file: latest.name,
      sizeBytes,
      sizeMb,
      fileCount,
    },
    null,
    2
  )
);

if (Number.isFinite(maxBytes) && maxBytes > 0 && sizeBytes > maxBytes) {
  throw new Error(`VSIX size ${sizeBytes} exceeds MAX_VSIX_BYTES=${maxBytes}.`);
}

if (Number.isFinite(maxFiles) && maxFiles > 0 && fileCount > maxFiles) {
  throw new Error(`VSIX file count ${fileCount} exceeds MAX_VSIX_FILES=${maxFiles}.`);
}
