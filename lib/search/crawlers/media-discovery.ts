import { createHash } from "node:crypto";

export type MediaAssetKind = "IMAGE" | "ARTIFACT";
export type ArtifactType =
  | "OPENAPI"
  | "JSON_SCHEMA"
  | "DIAGRAM"
  | "MODEL_CARD"
  | "BENCHMARK"
  | "UI_SCREENSHOT"
  | "OTHER";

export interface DiscoveredMediaAsset {
  assetKind: MediaAssetKind;
  artifactType: ArtifactType | null;
  url: string;
  sourcePageUrl: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  contextText: string | null;
  mimeType: string | null;
  byteSize: number | null;
  crawlDomain: string;
  discoveryMethod:
    | "README"
    | "HOMEPAGE"
    | "OG_IMAGE"
    | "HTML_IMG"
    | "ARTIFACT_LINK"
    | "WEB_CRAWL";
  urlNormHash: string;
  qualityScore: number;
  safetyScore: number;
  rankScore: number;
  isPublic: boolean;
  sha256: string;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)$/i;
const ARTIFACT_EXT_RE = /\.(json|ya?ml|md|pdf)$/i;
const BADGE_OR_ICON_RE =
  /(badge|shields\.io|img\.shields\.io|icon|favicon|logo|tracker|pixel|analytics)/i;
const PRIVATE_HOST_RE =
  /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^169\.254\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)/;

function parseCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_ALLOWED_HOSTS = [
  "raw.githubusercontent.com",
  "github.com",
  "opengraph.githubassets.com",
  "avatars.githubusercontent.com",
];

function isAllowedHost(hostname: string): boolean {
  const allow = parseCsvEnv("SEARCH_MEDIA_ALLOWED_HOSTS");
  const deny = parseCsvEnv("SEARCH_MEDIA_DENIED_HOSTS");
  const host = hostname.toLowerCase();
  if (deny.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  const whitelist = allow.length > 0 ? allow : DEFAULT_ALLOWED_HOSTS;
  return whitelist.some((h) => host === h || host.endsWith(`.${h}`));
}

function normalizeUrl(raw: string, baseUrl: string): string | null {
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== "https:") return null;
    if (PRIVATE_HOST_RE.test(url.hostname)) return null;
    if (!isAllowedHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function classifyArtifact(url: string, altText?: string | null): ArtifactType {
  const lower = `${url} ${(altText ?? "").toLowerCase()}`;
  if (lower.includes("openapi") || lower.includes("swagger")) return "OPENAPI";
  if (lower.includes("schema")) return "JSON_SCHEMA";
  if (lower.includes("model card")) return "MODEL_CARD";
  if (lower.includes("benchmark")) return "BENCHMARK";
  if (lower.includes("diagram") || lower.includes("architecture")) return "DIAGRAM";
  if (lower.includes("screenshot") || lower.includes("ui")) return "UI_SCREENSHOT";
  return "OTHER";
}

function scoreQuality(url: string, altText: string | null, sourcePageUrl: string): number {
  let score = 40;
  if (IMAGE_EXT_RE.test(url)) score += 20;
  if (ARTIFACT_EXT_RE.test(url)) score += 20;
  if (altText && altText.length > 8) score += 15;
  if (sourcePageUrl.includes("github.com")) score += 5;
  if (/openapi|swagger|schema|benchmark|model.?card|architecture|diagram/i.test(url)) score += 10;
  if (BADGE_OR_ICON_RE.test(url) || BADGE_OR_ICON_RE.test(altText ?? "")) score -= 25;
  return Math.min(100, score);
}

function scoreSafety(url: string, text: string): number {
  const lower = `${url} ${text}`.toLowerCase();
  if (/(nsfw|xxx|porn|casino|betting|tracker|adserver)/.test(lower)) return 10;
  return 80;
}

function parseMarkdownLinks(markdown: string): Array<{ rawUrl: string; alt: string | null; method: DiscoveredMediaAsset["discoveryMethod"] }> {
  const out: Array<{ rawUrl: string; alt: string | null; method: DiscoveredMediaAsset["discoveryMethod"] }> = [];
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g;
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = imageRe.exec(markdown))) {
    out.push({ rawUrl: m[2], alt: m[1] || null, method: "README" });
  }
  while ((m = linkRe.exec(markdown))) {
    const url = m[2];
    if (IMAGE_EXT_RE.test(url) || ARTIFACT_EXT_RE.test(url)) {
      out.push({ rawUrl: url, alt: m[1] || null, method: "ARTIFACT_LINK" });
    }
  }
  return out;
}

function parseHtmlAssets(html: string): Array<{ rawUrl: string; alt: string | null; method: DiscoveredMediaAsset["discoveryMethod"] }> {
  const out: Array<{ rawUrl: string; alt: string | null; method: DiscoveredMediaAsset["discoveryMethod"] }> = [];
  const imgRe = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const pictureSourceRe = /<source[^>]*srcset=["']([^"']+)["'][^>]*>/gi;
  const ogRe = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  const twitterRe = /<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  const artifactHrefRe =
    /<a[^>]*href=["']([^"']+\.(?:json|ya?ml|md|pdf))["'][^>]*>(.*?)<\/a>/gi;
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) out.push({ rawUrl: m[1], alt: null, method: "HTML_IMG" });
  while ((m = pictureSourceRe.exec(html))) out.push({ rawUrl: m[1].split(",")[0]?.trim() ?? m[1], alt: null, method: "HTML_IMG" });
  while ((m = ogRe.exec(html))) out.push({ rawUrl: m[1], alt: null, method: "OG_IMAGE" });
  while ((m = twitterRe.exec(html))) out.push({ rawUrl: m[1], alt: null, method: "OG_IMAGE" });
  while ((m = artifactHrefRe.exec(html))) out.push({ rawUrl: m[1], alt: (m[2] ?? "").trim() || null, method: "ARTIFACT_LINK" });
  while ((m = jsonLdRe.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown> | Array<Record<string, unknown>>;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const image = node.image;
        if (typeof image === "string") out.push({ rawUrl: image, alt: null, method: "WEB_CRAWL" });
        if (Array.isArray(image)) {
          for (const img of image) {
            if (typeof img === "string") out.push({ rawUrl: img, alt: null, method: "WEB_CRAWL" });
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out;
}

async function probeUrl(
  url: string
): Promise<{ mimeType: string | null; byteSize: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    const mimeType = res.headers.get("content-type");
    const size = Number(res.headers.get("content-length"));
    return {
      mimeType: mimeType ? mimeType.split(";")[0].trim().toLowerCase() : null,
      byteSize: Number.isFinite(size) ? size : null,
    };
  } catch {
    return { mimeType: null, byteSize: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverMediaAssets(params: {
  sourcePageUrl: string;
  markdownOrHtml: string;
  isHtml?: boolean;
  discoveryMethod?: DiscoveredMediaAsset["discoveryMethod"];
}): Promise<DiscoveredMediaAsset[]> {
  const links = params.isHtml
    ? parseHtmlAssets(params.markdownOrHtml)
    : parseMarkdownLinks(params.markdownOrHtml);
  const seen = new Set<string>();
  const out: DiscoveredMediaAsset[] = [];

  for (const link of links) {
    const normalized = normalizeUrl(link.rawUrl, params.sourcePageUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const isImage = IMAGE_EXT_RE.test(normalized);
    const isArtifact = ARTIFACT_EXT_RE.test(normalized);
    if (!isImage && !isArtifact) continue;

    const probe = await probeUrl(normalized);
    if (probe.mimeType) {
      if (isImage && !probe.mimeType.startsWith("image/")) continue;
      if (
        isArtifact &&
        !(
          probe.mimeType.includes("json") ||
          probe.mimeType.includes("yaml") ||
          probe.mimeType.includes("markdown") ||
          probe.mimeType.includes("text/") ||
          probe.mimeType.includes("pdf")
        )
      ) {
        continue;
      }
    }
    const text = link.alt ?? "";
    const crawlDomain = new URL(normalized).hostname.toLowerCase();
    const sourceText = `${params.sourcePageUrl} ${text}`;
    const quality = scoreQuality(normalized, link.alt, params.sourcePageUrl);
    const safety = scoreSafety(normalized, sourceText);
    const rankScore = Math.max(0, Math.round(quality * 0.7 + safety * 0.3));
    const normalizedForHash = normalized.toLowerCase().replace(/[?#].*$/, "");
    out.push({
      assetKind: isImage ? "IMAGE" : "ARTIFACT",
      artifactType: isImage ? null : classifyArtifact(normalized, link.alt),
      url: normalized,
      sourcePageUrl: params.sourcePageUrl,
      title: null,
      caption: null,
      altText: link.alt,
      contextText: text || null,
      mimeType: probe.mimeType,
      byteSize: probe.byteSize,
      crawlDomain,
      discoveryMethod: params.discoveryMethod ?? link.method,
      urlNormHash: createHash("sha256").update(normalizedForHash).digest("hex"),
      qualityScore: quality,
      safetyScore: safety,
      rankScore,
      isPublic: true,
      sha256: createHash("sha256").update(normalized).digest("hex"),
    });
  }

  return out;
}

export function extractOutboundWebLinks(content: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const markdownLinkRe = /\[[^\]]+\]\(([^)\s]+)\)/g;
  const htmlHrefRe = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = markdownLinkRe.exec(content))) {
    const normalized = normalizeUrl(m[1], baseUrl);
    if (normalized) links.add(normalized);
  }
  while ((m = htmlHrefRe.exec(content))) {
    const normalized = normalizeUrl(m[1], baseUrl);
    if (normalized) links.add(normalized);
  }
  return [...links];
}

export function canCrawlHomepage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !PRIVATE_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

export async function fetchHomepageContent(
  url: string
): Promise<string | null> {
  if (!canCrawlHomepage(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "xpersona-media-crawler" },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) return null;
    const text = await res.text();
    return text.slice(0, 250_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
