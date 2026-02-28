/**
 * ClawHub crawler - discovers OpenClaw skills from the ClawHub public API.
 * Falls back to openclaw/skills GitHub repo (archives ClawHub) if API is unavailable.
 */
import pLimit from "p-limit";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { octokit, fetchFileContent, withGithubRetry } from "../utils/github";
import { parseSkillMd } from "../parsers/skill-md";
import { generateSlug } from "../utils/slug";
import { upsertAgent } from "../agent-upsert";
import { ingestAgentMedia } from "./media-ingestion";

const SKILLS_REPO = "openclaw/skills";
const CONCURRENCY_RAW = Number(process.env.CLAWHUB_DETAIL_CONCURRENCY ?? "2");
const CONCURRENCY =
  Number.isFinite(CONCURRENCY_RAW) && CONCURRENCY_RAW > 0
    ? Math.min(10, Math.floor(CONCURRENCY_RAW))
    : 2;
const RATE_LIMIT_DELAY_MS = 800;
const CLAWHUB_API_BASE =
  process.env.CLAWHUB_API_BASE?.trim() || "https://wry-manatee-359.convex.site";
const CLAWHUB_SITE_BASE = process.env.CLAWHUB_SITE_BASE?.trim() || "https://clawhub.ai";
const CLAWHUB_PAGE_LIMIT_RAW = Number(process.env.CLAWHUB_PAGE_LIMIT ?? "200");
const CLAWHUB_PAGE_LIMIT =
  Number.isFinite(CLAWHUB_PAGE_LIMIT_RAW) && CLAWHUB_PAGE_LIMIT_RAW > 0
    ? Math.min(500, Math.floor(CLAWHUB_PAGE_LIMIT_RAW))
    : 200;
const CLAWHUB_SORT = (process.env.CLAWHUB_SORT ?? "downloads").toLowerCase();
const CLAWHUB_DIR = (process.env.CLAWHUB_DIR ?? "desc").toLowerCase();
const CLAWHUB_API_MAX_RETRIES_RAW = Number(process.env.CLAWHUB_API_MAX_RETRIES ?? "8");
const CLAWHUB_API_MAX_RETRIES =
  Number.isFinite(CLAWHUB_API_MAX_RETRIES_RAW) && CLAWHUB_API_MAX_RETRIES_RAW >= 0
    ? Math.min(20, Math.floor(CLAWHUB_API_MAX_RETRIES_RAW))
    : 8;
const CLAWHUB_API_BASE_BACKOFF_MS_RAW = Number(
  process.env.CLAWHUB_API_BASE_BACKOFF_MS ?? "1500"
);
const CLAWHUB_API_BASE_BACKOFF_MS =
  Number.isFinite(CLAWHUB_API_BASE_BACKOFF_MS_RAW) && CLAWHUB_API_BASE_BACKOFF_MS_RAW > 0
    ? Math.floor(CLAWHUB_API_BASE_BACKOFF_MS_RAW)
    : 1500;
const CLAWHUB_API_MAX_BACKOFF_MS_RAW = Number(
  process.env.CLAWHUB_API_MAX_BACKOFF_MS ?? "60000"
);
const CLAWHUB_API_MAX_BACKOFF_MS =
  Number.isFinite(CLAWHUB_API_MAX_BACKOFF_MS_RAW) && CLAWHUB_API_MAX_BACKOFF_MS_RAW > 0
    ? Math.floor(CLAWHUB_API_MAX_BACKOFF_MS_RAW)
    : 60000;
const CLAWHUB_API_PAGE_DELAY_MS_RAW = Number(process.env.CLAWHUB_API_PAGE_DELAY_MS ?? "1000");
const CLAWHUB_API_PAGE_DELAY_MS =
  Number.isFinite(CLAWHUB_API_PAGE_DELAY_MS_RAW) && CLAWHUB_API_PAGE_DELAY_MS_RAW >= 0
    ? Math.floor(CLAWHUB_API_PAGE_DELAY_MS_RAW)
    : 1000;
const CLAWHUB_VERSIONS_PAGE_LIMIT_RAW = Number(process.env.CLAWHUB_VERSIONS_PAGE_LIMIT ?? "200");
const CLAWHUB_VERSIONS_PAGE_LIMIT =
  Number.isFinite(CLAWHUB_VERSIONS_PAGE_LIMIT_RAW) && CLAWHUB_VERSIONS_PAGE_LIMIT_RAW > 0
    ? Math.min(500, Math.floor(CLAWHUB_VERSIONS_PAGE_LIMIT_RAW))
    : 200;
const CLAWHUB_VERSIONS_MAX_PAGES_RAW = Number(process.env.CLAWHUB_VERSIONS_MAX_PAGES ?? "20");
const CLAWHUB_VERSIONS_MAX_PAGES =
  Number.isFinite(CLAWHUB_VERSIONS_MAX_PAGES_RAW) && CLAWHUB_VERSIONS_MAX_PAGES_RAW > 0
    ? Math.min(200, Math.floor(CLAWHUB_VERSIONS_MAX_PAGES_RAW))
    : 20;
const CLAWHUB_PAGE_META_TIMEOUT_MS_RAW = Number(process.env.CLAWHUB_PAGE_META_TIMEOUT_MS ?? "15000");
const CLAWHUB_PAGE_META_TIMEOUT_MS =
  Number.isFinite(CLAWHUB_PAGE_META_TIMEOUT_MS_RAW) && CLAWHUB_PAGE_META_TIMEOUT_MS_RAW > 0
    ? Math.floor(CLAWHUB_PAGE_META_TIMEOUT_MS_RAW)
    : 15000;
const CLAWHUB_ARCHIVE_ENABLED = process.env.CLAWHUB_ARCHIVE_ENABLED !== "0";
const CLAWHUB_ARCHIVE_MAX_VERSIONS_RAW = Number(process.env.CLAWHUB_ARCHIVE_MAX_VERSIONS ?? "10");
const CLAWHUB_ARCHIVE_MAX_VERSIONS =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_VERSIONS_RAW) && CLAWHUB_ARCHIVE_MAX_VERSIONS_RAW > 0
    ? Math.min(200, Math.floor(CLAWHUB_ARCHIVE_MAX_VERSIONS_RAW))
    : 10;
const CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES ?? "10000000"
);
const CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES_RAW) &&
  CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES_RAW > 0
    ? Math.floor(CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES_RAW)
    : 10000000;
const CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION ?? "400"
);
const CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION_RAW) &&
  CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION_RAW > 0
    ? Math.min(5000, Math.floor(CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION_RAW))
    : 400;
const CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION ?? "12"
);
const CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION_RAW) &&
  CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION_RAW > 0
    ? Math.min(500, Math.floor(CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION_RAW))
    : 12;
const CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE ?? "250000"
);
const CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE_RAW) &&
  CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE_RAW > 0
    ? Math.floor(CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE_RAW)
    : 250000;
const CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE ?? "50000"
);
const CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE_RAW) &&
  CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE_RAW > 0
    ? Math.floor(CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE_RAW)
    : 50000;
const CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL_RAW = Number(
  process.env.CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL ?? "140000"
);
const CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL =
  Number.isFinite(CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL_RAW) &&
  CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL_RAW > 0
    ? Math.floor(CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL_RAW)
    : 140000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const asNumeric = Number(raw);
  if (Number.isFinite(asNumeric) && asNumeric >= 0) {
    // Some providers send absolute UNIX timestamps instead of delta seconds.
    if (asNumeric >= 1_000_000_000_000) {
      return Math.max(0, Math.floor(asNumeric - Date.now()));
    }
    if (asNumeric >= 1_000_000_000) {
      return Math.max(0, Math.floor(asNumeric * 1000 - Date.now()));
    }
    return Math.floor(asNumeric * 1000);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 502 || status === 503 || status === 504;
}

function computeBackoffMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 250);
  const exp = CLAWHUB_API_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(CLAWHUB_API_MAX_BACKOFF_MS, exp + jitter);
}

function clampWaitMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1000;
  // Node timers use 32-bit signed int max. Keep well under that.
  return Math.min(2_000_000_000, Math.min(CLAWHUB_API_MAX_BACKOFF_MS, Math.floor(ms)));
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function buildClawhubSourceId(ownerKey: string, slug: string): string {
  const raw = `clawhub:${ownerKey}:${slug}`;
  if (raw.length <= 255) return raw;
  const slugSlice = slug.slice(0, 120);
  const ownerSlice = ownerKey.slice(0, 60);
  const hash = shortHash(raw);
  return `clawhub:${ownerSlice}:${slugSlice}:h${hash}`.slice(0, 255);
}

function truncateVarchar(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function normalizeAgentName(value: string | null | undefined, fallback: string): string {
  const candidate = (value ?? "").trim();
  const safe = candidate.length > 0 ? candidate : fallback;
  return truncateVarchar(safe, 255);
}

function normalizeAgentSlug(value: string, fallbackPrefix: string, idx: number): string {
  const s = (value ?? "").trim();
  if (s.length > 0) return truncateVarchar(s, 255);
  return truncateVarchar(`${fallbackPrefix}-${idx}`, 255);
}

type ClawHubSkillListItem = {
  slug: string;
  displayName?: string | null;
  summary?: string | null;
  tags?: Record<string, string>;
  stats?: {
    downloads?: number;
    stars?: number;
    installsAllTime?: number;
    installsCurrent?: number;
    versions?: number;
  };
  createdAt?: number;
  updatedAt?: number;
  latestVersion?: { version?: string; createdAt?: number; changelog?: string };
  metadata?: Record<string, unknown> | null;
};

type ClawHubSkillDetail = {
  skill?: ClawHubSkillListItem;
  latestVersion?: { version?: string; createdAt?: number; changelog?: string };
  owner?: { handle?: string | null; userId?: string | null; displayName?: string | null };
  moderation?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type ClawHubSkillVersion = {
  version?: string;
  createdAt?: number;
  changelog?: string;
  changelogSource?: string;
};

type ClawHubSkillVersionsResponse = {
  items?: ClawHubSkillVersion[];
  nextCursor?: string | null;
};

type ClawHubArchiveFileRecord = {
  path: string;
  size: number;
  compressedSize: number;
  compression: "stored" | "deflate" | "other";
};

type ClawHubArchiveTextFile = {
  path: string;
  content: string;
  truncated: boolean;
};

type ClawHubVersionArchive = {
  version: string;
  zipByteSize: number;
  fileCount: number;
  filesOmitted: number;
  files: ClawHubArchiveFileRecord[];
  textFiles: ClawHubArchiveTextFile[];
  fetchedAt: string;
};

type ZipEntryMeta = {
  path: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

async function fetchClawHubSkillListPage(params: {
  cursor?: string | null;
  limit: number;
  sort: string;
  dir: string;
}): Promise<{ items: ClawHubSkillListItem[]; nextCursor?: string | null }> {
  const url = new URL("/api/v1/skills", CLAWHUB_API_BASE);
  url.searchParams.set("sort", params.sort);
  url.searchParams.set("dir", params.dir);
  url.searchParams.set("limit", String(params.limit));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) {
      return (await res.json()) as { items: ClawHubSkillListItem[]; nextCursor?: string | null };
    }
    const body = await res.text();
    lastErr = `ClawHub API error ${res.status}: ${body.slice(0, 240)}`;
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) {
      throw new Error(lastErr);
    }
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = clampWaitMs(retryAfterMs ?? computeBackoffMs(attempt + 1));
    console.warn(
      `[CRAWL] CLAWHUB list retry attempt=${attempt + 1} status=${res.status} waitMs=${waitMs}`
    );
    await sleep(waitMs);
  }
  throw new Error(lastErr);
}

async function fetchClawHubSkillDetail(slug: string): Promise<ClawHubSkillDetail | null> {
  const url = new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, CLAWHUB_API_BASE);
  let lastStatus = 0;
  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) return (await res.json()) as ClawHubSkillDetail;
    lastStatus = res.status;
    if (res.status === 404) return null;
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) return null;
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = clampWaitMs(retryAfterMs ?? computeBackoffMs(attempt + 1));
    await sleep(waitMs);
  }
  console.warn(`[CRAWL] CLAWHUB detail exhausted retries slug=${slug} lastStatus=${lastStatus}`);
  return null;
}

async function fetchClawHubSkillVersionsPage(params: {
  slug: string;
  cursor?: string | null;
  limit: number;
}): Promise<ClawHubSkillVersionsResponse> {
  const url = new URL(`/api/v1/skills/${encodeURIComponent(params.slug)}/versions`, CLAWHUB_API_BASE);
  url.searchParams.set("limit", String(params.limit));
  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  }
  let lastStatus = 0;
  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) {
      return (await res.json()) as ClawHubSkillVersionsResponse;
    }
    lastStatus = res.status;
    if (res.status === 404) return { items: [], nextCursor: null };
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) {
      break;
    }
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = clampWaitMs(retryAfterMs ?? computeBackoffMs(attempt + 1));
    await sleep(waitMs);
  }
  console.warn(`[CRAWL] CLAWHUB versions exhausted retries slug=${params.slug} lastStatus=${lastStatus}`);
  return { items: [], nextCursor: null };
}

async function fetchAllClawHubSkillVersions(slug: string): Promise<ClawHubSkillVersion[]> {
  const versions: ClawHubSkillVersion[] = [];
  let cursor: string | null | undefined = null;
  for (let page = 0; page < CLAWHUB_VERSIONS_MAX_PAGES; page++) {
    const chunk = await fetchClawHubSkillVersionsPage({
      slug,
      cursor,
      limit: CLAWHUB_VERSIONS_PAGE_LIMIT,
    });
    const items = Array.isArray(chunk.items) ? chunk.items : [];
    if (items.length === 0) break;
    versions.push(...items);
    if (!chunk.nextCursor) break;
    cursor = chunk.nextCursor;
    if (CLAWHUB_API_PAGE_DELAY_MS > 0) {
      await sleep(Math.min(250, CLAWHUB_API_PAGE_DELAY_MS));
    }
  }
  return versions;
}

function readUInt16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function decodeZipPath(raw: Uint8Array, utf8: boolean): string {
  const decoded = Buffer.from(raw).toString(utf8 ? "utf8" : "latin1");
  return decoded.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function parseZipEntries(bytes: Uint8Array): ZipEntryMeta[] {
  const EOCD_SIG = 0x06054b50;
  const CENTRAL_SIG = 0x02014b50;
  const minEocdSize = 22;
  if (bytes.length < minEocdSize) return [];

  const searchStart = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - minEocdSize; i >= searchStart; i--) {
    if (readUInt32LE(bytes, i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const totalEntries = readUInt16LE(bytes, eocdOffset + 10) ?? 0;
  const centralDirSize = readUInt32LE(bytes, eocdOffset + 12) ?? 0;
  const centralDirOffset = readUInt32LE(bytes, eocdOffset + 16) ?? 0;
  if (centralDirOffset < 0 || centralDirOffset + centralDirSize > bytes.length) return [];

  const out: ZipEntryMeta[] = [];
  let cursor = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > bytes.length) break;
    const sig = readUInt32LE(bytes, cursor);
    if (sig !== CENTRAL_SIG) break;
    const flags = readUInt16LE(bytes, cursor + 8) ?? 0;
    const method = readUInt16LE(bytes, cursor + 10) ?? 0;
    const compressedSize = readUInt32LE(bytes, cursor + 20) ?? 0;
    const uncompressedSize = readUInt32LE(bytes, cursor + 24) ?? 0;
    const nameLen = readUInt16LE(bytes, cursor + 28) ?? 0;
    const extraLen = readUInt16LE(bytes, cursor + 30) ?? 0;
    const commentLen = readUInt16LE(bytes, cursor + 32) ?? 0;
    const localHeaderOffset = readUInt32LE(bytes, cursor + 42) ?? 0;
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.length) break;
    const utf8 = (flags & 0x0800) !== 0;
    const path = decodeZipPath(bytes.subarray(nameStart, nameEnd), utf8);
    out.push({
      path,
      flags,
      compressionMethod: method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = nameEnd + extraLen + commentLen;
  }
  return out;
}

function extractZipEntry(bytes: Uint8Array, entry: ZipEntryMeta): Uint8Array | null {
  const LOCAL_SIG = 0x04034b50;
  if (entry.localHeaderOffset < 0 || entry.localHeaderOffset + 30 > bytes.length) return null;
  if (readUInt32LE(bytes, entry.localHeaderOffset) !== LOCAL_SIG) return null;
  const localNameLen = readUInt16LE(bytes, entry.localHeaderOffset + 26) ?? 0;
  const localExtraLen = readUInt16LE(bytes, entry.localHeaderOffset + 28) ?? 0;
  const dataStart = entry.localHeaderOffset + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > bytes.length || dataEnd < dataStart) return null;
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    try {
      return inflateRawSync(Buffer.from(compressed));
    } catch {
      return null;
    }
  }
  return null;
}

function isLikelyTextFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith("/")) return false;
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".json") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".ini") ||
    lower.endsWith(".cfg") ||
    lower.endsWith("license") ||
    lower.endsWith("readme")
  );
}

function scoreArchiveTextPath(path: string): number {
  const lower = path.toLowerCase();
  if (/(^|\/)skill\.md$/.test(lower)) return 1000;
  if (/(^|\/)readme(\.[a-z0-9]+)?$/.test(lower)) return 900;
  if (/(^|\/)_meta\.json$/.test(lower)) return 800;
  if (/(^|\/)references\//.test(lower)) return 700;
  if (/(^|\/)scripts\//.test(lower)) return 650;
  if (lower.endsWith(".md")) return 600;
  if (lower.endsWith(".json")) return 550;
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) return 500;
  return 300;
}

function toCompressionLabel(method: number): "stored" | "deflate" | "other" {
  if (method === 0) return "stored";
  if (method === 8) return "deflate";
  return "other";
}

async function fetchClawHubVersionArchiveBytes(
  slug: string,
  version: string
): Promise<Uint8Array | null> {
  const url = new URL("/api/v1/download", CLAWHUB_API_BASE);
  url.searchParams.set("slug", slug);
  url.searchParams.set("version", version);

  for (let attempt = 0; attempt <= CLAWHUB_API_MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/zip",
        "User-Agent": "xpersona-crawler",
      },
    });
    if (res.ok) {
      const contentLength = Number(res.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES) {
        console.warn(
          `[CRAWL] CLAWHUB archive skipped (size limit) slug=${slug} version=${version} size=${contentLength}`
        );
        return null;
      }
      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.byteLength > CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES) {
        console.warn(
          `[CRAWL] CLAWHUB archive skipped (size limit) slug=${slug} version=${version} size=${buffer.byteLength}`
        );
        return null;
      }
      return buffer;
    }
    if (res.status === 404) return null;
    if (attempt >= CLAWHUB_API_MAX_RETRIES || !isRetryableStatus(res.status)) {
      return null;
    }
    const retryAfterMs = parseRetryAfterMs(res.headers);
    const waitMs = clampWaitMs(retryAfterMs ?? computeBackoffMs(attempt + 1));
    await sleep(waitMs);
  }
  return null;
}

async function fetchClawHubVersionArchive(
  slug: string,
  version: string
): Promise<ClawHubVersionArchive | null> {
  const bytes = await fetchClawHubVersionArchiveBytes(slug, version);
  if (!bytes) return null;

  const entries = parseZipEntries(bytes);
  if (entries.length === 0) return null;

  const filesLimited = entries.slice(0, CLAWHUB_ARCHIVE_MAX_FILES_PER_VERSION);
  const filesOmitted = Math.max(0, entries.length - filesLimited.length);
  let remainingCharsBudget =
    CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE * CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION;

  const textCandidates = filesLimited
    .filter((entry) => {
      if (!isLikelyTextFile(entry.path)) return false;
      return (
        entry.uncompressedSize > 0 &&
        entry.uncompressedSize <= CLAWHUB_ARCHIVE_MAX_TEXT_BYTES_PER_FILE
      );
    })
    .sort((a, b) => scoreArchiveTextPath(b.path) - scoreArchiveTextPath(a.path))
    .slice(0, CLAWHUB_ARCHIVE_MAX_TEXT_FILES_PER_VERSION);

  const textFiles: ClawHubArchiveTextFile[] = [];
  for (const entry of textCandidates) {
    if (remainingCharsBudget <= 0) break;
    const raw = extractZipEntry(bytes, entry);
    if (!raw) continue;
    let content = Buffer.from(raw).toString("utf8").replace(/\u0000/g, "").trim();
    if (!content) continue;
    let truncated = false;
    const maxChars = Math.min(CLAWHUB_ARCHIVE_MAX_TEXT_CHARS_PER_FILE, remainingCharsBudget);
    if (content.length > maxChars) {
      content = content.slice(0, maxChars);
      truncated = true;
    }
    remainingCharsBudget = Math.max(0, remainingCharsBudget - content.length);
    textFiles.push({
      path: entry.path,
      content,
      truncated,
    });
  }

  return {
    version,
    zipByteSize: bytes.byteLength,
    fileCount: entries.length,
    filesOmitted,
    files: filesLimited.map((entry) => ({
      path: entry.path,
      size: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
      compression: toCompressionLabel(entry.compressionMethod),
    })),
    textFiles,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchClawHubVersionArchives(
  slug: string,
  versions: ClawHubSkillVersion[]
): Promise<ClawHubVersionArchive[]> {
  if (!CLAWHUB_ARCHIVE_ENABLED) return [];

  const ordered = versions
    .map((v) => ({ version: (v.version ?? "").trim() }))
    .filter((v) => v.version.length > 0);
  const uniqueVersions: string[] = [];
  const seen = new Set<string>();
  for (const v of ordered) {
    if (seen.has(v.version)) continue;
    seen.add(v.version);
    uniqueVersions.push(v.version);
  }
  const targetVersions = uniqueVersions.slice(0, CLAWHUB_ARCHIVE_MAX_VERSIONS);
  const archives: ClawHubVersionArchive[] = [];
  let skillCharsBudget = CLAWHUB_ARCHIVE_MAX_TOTAL_TEXT_CHARS_PER_SKILL;
  for (const version of targetVersions) {
    const archive = await fetchClawHubVersionArchive(slug, version);
    if (!archive) continue;
    if (skillCharsBudget <= 0) {
      archive.textFiles = [];
      archives.push(archive);
      continue;
    }
    for (const textFile of archive.textFiles) {
      if (skillCharsBudget <= 0) {
        textFile.content = "";
        textFile.truncated = true;
        continue;
      }
      if (textFile.content.length > skillCharsBudget) {
        textFile.content = textFile.content.slice(0, skillCharsBudget);
        textFile.truncated = true;
      }
      skillCharsBudget = Math.max(0, skillCharsBudget - textFile.content.length);
    }
    archive.textFiles = archive.textFiles.filter((t) => t.content.length > 0);
    archives.push(archive);
  }
  return archives;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function matchFirst(input: string, regex: RegExp): string | null {
  const m = input.match(regex);
  if (!m || !m[1]) return null;
  return decodeHtmlEntities(m[1].replace(/\s+/g, " "));
}

async function fetchClawHubSkillPageMeta(ownerOrId: string, slug: string): Promise<{
  title: string | null;
  description: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  pageUrl: string;
} | null> {
  const pageUrl = `${CLAWHUB_SITE_BASE}/${encodeURIComponent(ownerOrId)}/${encodeURIComponent(slug)}`;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), CLAWHUB_PAGE_META_TIMEOUT_MS);
    const res = await fetch(pageUrl, {
      headers: { Accept: "text/html", "User-Agent": "xpersona-crawler" },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const title = matchFirst(html, /<title>([^<]+)<\/title>/i);
    const description = matchFirst(
      html,
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );
    const ogImage = matchFirst(
      html,
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    );
    const canonicalUrl = matchFirst(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i
    );
    return {
      title,
      description,
      ogImage,
      canonicalUrl,
      pageUrl,
    };
  } catch {
    return null;
  }
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function buildClawHubSearchText(input: {
  skill: ClawHubSkillListItem;
  detail: ClawHubSkillDetail | null;
  versions: ClawHubSkillVersion[];
  archives: ClawHubVersionArchive[];
}): string {
  const lines: string[] = [];
  const skillName = input.detail?.skill?.displayName ?? input.skill.displayName ?? input.skill.slug;
  const summary = input.detail?.skill?.summary ?? input.skill.summary ?? "";
  const ownerHandle = input.detail?.owner?.handle ?? input.detail?.owner?.userId ?? "";
  const tagPairs = Object.entries(input.detail?.skill?.tags ?? input.skill.tags ?? {});

  lines.push(`Skill: ${skillName}`);
  if (ownerHandle) lines.push(`Owner: ${ownerHandle}`);
  if (summary) lines.push(`Summary: ${summary}`);
  if (tagPairs.length > 0) {
    lines.push(
      `Tags: ${tagPairs
        .map(([k, v]) => `${k}:${v}`)
        .join(", ")}`
    );
  }

  if (input.versions.length > 0) {
    lines.push("Version history:");
    for (const v of input.versions) {
      const ver = (v.version ?? "").trim();
      if (!ver) continue;
      const changelog = (v.changelog ?? "").trim();
      const createdAt = typeof v.createdAt === "number" ? new Date(v.createdAt).toISOString() : null;
      const parts = [`v${ver}`];
      if (createdAt) parts.push(createdAt);
      if (v.changelogSource) parts.push(v.changelogSource);
      lines.push(parts.join(" | "));
      if (changelog) lines.push(changelog);
    }
  }

  if (input.archives.length > 0) {
    lines.push("Archive index:");
    for (const archive of input.archives) {
      lines.push(
        `Archive v${archive.version}: ${archive.fileCount} files, ${archive.zipByteSize} bytes`
      );
      if (archive.files.length > 0) {
        lines.push(
          `Files: ${archive.files
            .slice(0, 80)
            .map((f) => `${f.path} (${f.size}b)`)
            .join(", ")}${archive.filesOmitted > 0 ? ` (+${archive.filesOmitted} more)` : ""}`
        );
      }
      for (const textFile of archive.textFiles) {
        lines.push(`File v${archive.version}:${textFile.path}`);
        lines.push(textFile.content);
      }
    }
  }

  return truncateText(lines.join("\n\n").trim(), 160000);
}

function computePopularityScore(downloads: number | undefined): number {
  const count = Math.max(0, downloads ?? 0);
  if (count === 0) return 40;
  const score = Math.min(100, Math.round(Math.log10(count + 1) * 20));
  return Math.max(40, score);
}

async function crawlClawHubApi(maxResults: number): Promise<number> {
  const limit = pLimit(CONCURRENCY);
  let totalFound = 0;
  let cursor: string | null | undefined = null;

  while (totalFound < maxResults) {
    const pageLimit = Math.max(1, Math.min(CLAWHUB_PAGE_LIMIT, maxResults - totalFound));
    const page = await fetchClawHubSkillListPage({
      cursor,
      limit: pageLimit,
      sort: CLAWHUB_SORT,
      dir: CLAWHUB_DIR,
    });
    if (!page.items || page.items.length === 0) break;

    const slice = page.items.slice(0, Math.max(0, maxResults - totalFound));
    const results = await Promise.all(
      slice.map((item) =>
        limit(async () => {
          const detail = await fetchClawHubSkillDetail(item.slug);
          const versions = await fetchAllClawHubSkillVersions(item.slug);
          const archives = await fetchClawHubVersionArchives(item.slug, versions);
          const ownerHandle = detail?.owner?.handle ?? null;
          const ownerId = detail?.owner?.userId ?? null;
          const ownerKey = ownerHandle ?? ownerId ?? "unknown";
          const pageMeta = await fetchClawHubSkillPageMeta(ownerKey, item.slug);
          const sourceId = buildClawhubSourceId(
            ownerId ?? ownerHandle ?? "unknown",
            item.slug
          );
          const displayName = normalizeAgentName(
            detail?.skill?.displayName ?? item.displayName ?? item.slug,
            item.slug
          );
          const summary = detail?.skill?.summary ?? item.summary ?? null;
          const url = `${CLAWHUB_SITE_BASE}/${encodeURIComponent(
            ownerKey
          )}/${encodeURIComponent(item.slug)}`;
          const rawSlug =
            generateSlug(
              `clawhub-${ownerKey}-${item.slug}`
            ) || `clawhub-${totalFound}`;
          const slug = normalizeAgentSlug(rawSlug, "clawhub", totalFound);
          const readme = buildClawHubSearchText({
            skill: item,
            detail,
            versions,
            archives,
          });

          const popularityScore = computePopularityScore(item.stats?.downloads);
          const now = new Date();
          const agentData = {
            sourceId: truncateVarchar(sourceId, 255),
            source: "CLAWHUB" as const,
            name: displayName,
            slug,
            description: summary,
            url,
            homepage: pageMeta?.canonicalUrl ?? url,
            capabilities: [],
            protocols: ["OPENCLEW"],
            languages: [] as string[],
            openclawData: {
              clawhub: {
                owner: detail?.owner ?? null,
                stats: item.stats ?? null,
                tags: detail?.skill?.tags ?? item.tags ?? null,
                latestVersion: detail?.latestVersion ?? item.latestVersion ?? null,
                createdAt: item.createdAt ?? null,
                updatedAt: item.updatedAt ?? null,
                metadata: detail?.metadata ?? item.metadata ?? null,
                moderation: detail?.moderation ?? null,
                versions,
                archives,
                pageMeta,
                listItem: item,
                detail,
                crawlContext: {
                  sourceListUrl: `${CLAWHUB_SITE_BASE}/skills?sort=${encodeURIComponent(CLAWHUB_SORT)}&dir=${encodeURIComponent(CLAWHUB_DIR)}`,
                  apiBase: CLAWHUB_API_BASE,
                  sort: CLAWHUB_SORT,
                  dir: CLAWHUB_DIR,
                  archiveEnabled: CLAWHUB_ARCHIVE_ENABLED,
                  archiveMaxVersions: CLAWHUB_ARCHIVE_MAX_VERSIONS,
                  archiveMaxDownloadBytes: CLAWHUB_ARCHIVE_MAX_DOWNLOAD_BYTES,
                  fetchedAt: now.toISOString(),
                },
              },
            } as Record<string, unknown>,
            readme,
            safetyScore: 80,
            popularityScore,
            freshnessScore: 70,
            performanceScore: 0,
            overallRank: 62,
            status: "ACTIVE" as const,
            lastCrawledAt: now,
            nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          };

          await upsertAgent(agentData, {
            name: agentData.name,
            slug: agentData.slug,
            description: agentData.description,
            url: agentData.url,
            homepage: agentData.homepage,
            openclawData: agentData.openclawData,
            readme: agentData.readme,
            lastCrawledAt: agentData.lastCrawledAt,
            nextCrawlAt: agentData.nextCrawlAt,
          });

          await ingestAgentMedia({
            agentSourceId: sourceId,
            agentUrl: url,
            homepageUrl: pageMeta?.canonicalUrl ?? url,
            source: "CLAWHUB",
            readmeOrHtml: readme,
            isHtml: false,
            allowHomepageFetch: true,
          });

          return true;
        })
      )
    );

    totalFound += results.filter(Boolean).length;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    await sleep(CLAWHUB_API_PAGE_DELAY_MS);
  }

  return totalFound;
}

async function crawlClawHubGitHub(maxResults: number): Promise<number> {
  const limit = pLimit(CONCURRENCY);
  let totalFound = 0;

  const { data: treeData } = await withGithubRetry(
    () =>
      octokit.rest.git.getTree({
        owner: "openclaw",
        repo: "skills",
        tree_sha: "main",
        recursive: "1",
      }),
    "git.getTree openclaw/skills"
  );

  const tree = treeData.tree as Array<{ path?: string; type?: string }>;
  const skillPaths = tree
    .filter((n) => n.path?.endsWith("/SKILL.md") && n.type === "blob")
    .map((n) => n.path!)
    .slice(0, maxResults);

  for (const path of skillPaths) {
    if (totalFound >= maxResults) break;

    const pathBase = path.replace(/\/SKILL\.md$/, "");
    const parts = pathBase.split("/");
    const slugFromPath = parts[parts.length - 1] ?? "skill";
    const sourceId = truncateVarchar(`clawhub:${pathBase.replace(/\//g, ":")}`, 255);

    const skillContent = await limit(() =>
      fetchFileContent(SKILLS_REPO, path, "main")
    );
    if (!skillContent) continue;

    const skillData = parseSkillMd(skillContent);
    const name = normalizeAgentName(skillData.name ?? slugFromPath, slugFromPath);
    const rawSlug =
      generateSlug(`clawhub-${pathBase.replace(/\//g, "-")}`) ||
      `clawhub-${totalFound}`;
    const slug = normalizeAgentSlug(rawSlug, "clawhub", totalFound);
    const url = `https://github.com/${SKILLS_REPO}/tree/main/${pathBase}`;

    const agentData = {
      sourceId,
      source: "CLAWHUB" as const,
      name,
      slug,
      description: skillData.description ?? null,
      url,
      homepage: skillData.homepage ?? null,
      capabilities: skillData.capabilities ?? [],
      protocols: skillData.protocols,
      languages: ["typescript"] as string[],
      openclawData: skillData as unknown as Record<string, unknown>,
      readme: skillContent,
      safetyScore: 80,
      popularityScore: 50,
      freshnessScore: 70,
      performanceScore: 0,
      overallRank: 62,
      status: "ACTIVE" as const,
      lastCrawledAt: new Date(),
      nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    await upsertAgent(agentData, {
      name: agentData.name,
      slug: agentData.slug,
      description: agentData.description,
      url: agentData.url,
      homepage: agentData.homepage,
      openclawData: agentData.openclawData,
      readme: agentData.readme,
      lastCrawledAt: agentData.lastCrawledAt,
      nextCrawlAt: agentData.nextCrawlAt,
    });
    await ingestAgentMedia({
      agentSourceId: sourceId,
      agentUrl: url,
      homepageUrl: skillData.homepage ?? null,
      source: "CLAWHUB",
      readmeOrHtml: skillContent,
      isHtml: false,
      allowHomepageFetch: true,
    });

    totalFound++;
    if (totalFound % 100 === 0) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return totalFound;
}

export async function crawlClawHub(
  maxResults: number = 5000
): Promise<{ total: number; jobId: string }> {
  const [job] = await db
    .insert(crawlJobs)
    .values({
      source: "CLAWHUB",
      status: "RUNNING",
      startedAt: new Date(),
    })
    .returning();

  const jobId = job?.id ?? crypto.randomUUID();
  let totalFound = 0;

  try {
    try {
      totalFound = await crawlClawHubApi(maxResults);
    } catch (err) {
      console.warn(
        "[CRAWL] CLAWHUB API failed, falling back to GitHub repo:",
        err instanceof Error ? err.message : String(err)
      );
      totalFound = await crawlClawHubGitHub(maxResults);
    }

    await db
      .update(crawlJobs)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        agentsFound: totalFound,
      })
      .where(eq(crawlJobs.id, jobId));
  } catch (err) {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(crawlJobs.id, jobId));
    throw err;
  }

  return { total: totalFound, jobId };
}
