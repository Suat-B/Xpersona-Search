import { promises as fs } from "node:fs";
import path from "node:path";

export type BinaryDesktopChannel = "stable" | "beta" | "internal";

export type BinaryDesktopReleaseManifest = {
  channel: BinaryDesktopChannel;
  version: string;
  releasedAt: string;
  notesUrl: string;
  downloads: {
    windows: string;
    macos: string;
    linux: string;
  };
  checksums: {
    windows: string;
    macos: string;
    linux: string;
  };
};

const CHANNELS: BinaryDesktopChannel[] = ["stable", "beta", "internal"];

async function readManifest(channel: BinaryDesktopChannel): Promise<BinaryDesktopReleaseManifest> {
  const manifestPath = path.join(process.cwd(), "public", "downloads", "binary-ide", `${channel}.json`);
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as BinaryDesktopReleaseManifest;
}

export async function loadBinaryDesktopReleaseManifests(): Promise<BinaryDesktopReleaseManifest[]> {
  return Promise.all(CHANNELS.map((channel) => readManifest(channel)));
}
