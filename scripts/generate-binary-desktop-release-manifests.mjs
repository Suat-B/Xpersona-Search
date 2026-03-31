import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "public", "downloads", "binary-ide");
const version = process.env.BINARY_DESKTOP_VERSION || "0.1.0";
const releasedAt = process.env.BINARY_DESKTOP_RELEASED_AT || new Date().toISOString();
const downloadBaseUrl = process.env.BINARY_DOWNLOAD_BASE_URL || "https://downloads.binaryide.ai/releases";

const channels = [
  { channel: "stable", version },
  { channel: "beta", version: `${version}-beta.1` },
  { channel: "internal", version: `${version}-internal.1` },
];

await mkdir(outDir, { recursive: true });

for (const { channel, version: channelVersion } of channels) {
  const payload = {
    channel,
    version: channelVersion,
    releasedAt,
    notesUrl: `/downloads/binary-ide#${channel}`,
    downloads: {
      windows: `${downloadBaseUrl}/${channel}/Binary-IDE-${channelVersion}-win-x64.exe`,
      macos: `${downloadBaseUrl}/${channel}/Binary-IDE-${channelVersion}-mac-universal.dmg`,
      linux: `${downloadBaseUrl}/${channel}/Binary-IDE-${channelVersion}-linux-x86_64.AppImage`,
    },
    checksums: {
      windows: "pending",
      macos: "pending",
      linux: "pending",
    },
  };
  await writeFile(path.join(outDir, `${channel}.json`), JSON.stringify(payload, null, 2));
}

console.log(`Generated Binary IDE desktop manifests in ${outDir}`);
