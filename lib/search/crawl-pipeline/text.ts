import { normalizePublicHttpsUrl } from "./url-policy";

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return decodeEntities(match[1]).replace(/\s+/g, " ").trim() || null;
}

function removeHtmlNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

export function htmlToPlainText(html: string): string {
  const stripped = removeHtmlNoise(html).replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

export function buildSnippet(text: string, maxChars = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function chunkText(text: string, chunkSize = 900, overlap = 120): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (chunkSize <= 0) return [normalized];
  const safeOverlap = Math.min(Math.max(0, overlap), Math.max(0, chunkSize - 1));
  const out: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const next = Math.min(normalized.length, cursor + chunkSize);
    out.push(normalized.slice(cursor, next));
    if (next >= normalized.length) break;
    cursor = Math.max(0, next - safeOverlap);
  }
  return out;
}

export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const hrefRe = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const srcRe = /<(?:img|script|source|iframe)[^>]*src=["']([^"']+)["'][^>]*>/gi;

  const pushMatch = (raw: string) => {
    const normalized = normalizePublicHttpsUrl(raw, baseUrl);
    if (!normalized) return;
    links.add(normalized);
  };

  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) pushMatch(m[1]);
  while ((m = srcRe.exec(html)) !== null) pushMatch(m[1]);
  return [...links];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}
