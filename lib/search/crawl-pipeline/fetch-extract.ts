import { extractLinksFromHtml, extractTitle, htmlToPlainText } from "./text";
import { getDomainFromUrl, normalizePublicHttpsUrl } from "./url-policy";

const DEFAULT_TIMEOUT_MS = Number(process.env.SEARCH_CRAWL_FETCH_TIMEOUT_MS ?? "8000");
const DEFAULT_MAX_BYTES = Number(process.env.SEARCH_CRAWL_FETCH_MAX_BYTES ?? "1048576");
const DEFAULT_MAX_REDIRECTS = Number(process.env.SEARCH_CRAWL_FETCH_MAX_REDIRECTS ?? "3");

export interface FetchedPage {
  url: string;
  statusCode: number;
  contentType: string | null;
  html: string;
  plainText: string;
  title: string | null;
  links: string[];
  domain: string;
}

async function fetchWithManualRedirect(
  inputUrl: string,
  timeoutMs: number,
  maxRedirects: number
): Promise<Response> {
  let current = inputUrl;
  for (let i = 0; i <= maxRedirects; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "xpersona-crawler/2.0 (+https://xpersona.co)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });
      const isRedirect = res.status >= 300 && res.status < 400;
      if (!isRedirect) return res;
      const location = res.headers.get("location");
      if (!location) return res;
      const next = normalizePublicHttpsUrl(location, current);
      if (!next) {
        throw new Error("redirect_target_rejected");
      }
      current = next;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("too_many_redirects");
}

async function readResponseTextLimited(res: Response, maxBytes: number): Promise<string> {
  const safeLimit = Math.max(1024, maxBytes);
  const body = res.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let out = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value ?? new Uint8Array(0);
    totalBytes += chunk.byteLength;

    if (totalBytes > safeLimit) {
      const overflow = totalBytes - safeLimit;
      const allowedSize = Math.max(0, chunk.byteLength - overflow);
      if (allowedSize > 0) {
        out += decoder.decode(chunk.subarray(0, allowedSize), { stream: true });
      }
      await reader.cancel();
      break;
    }

    out += decoder.decode(chunk, { stream: true });
  }

  out += decoder.decode();
  return out;
}

export async function fetchAndExtractPublicPage(url: string): Promise<FetchedPage | null> {
  const normalized = normalizePublicHttpsUrl(url);
  if (!normalized) return null;

  const res = await fetchWithManualRedirect(
    normalized,
    Math.max(1000, DEFAULT_TIMEOUT_MS),
    Math.max(0, DEFAULT_MAX_REDIRECTS)
  );
  const statusCode = res.status;
  if (statusCode < 200 || statusCode >= 400) {
    return null;
  }

  const contentType = res.headers.get("content-type");
  if (!contentType?.toLowerCase().includes("text/html")) return null;

  const html = await readResponseTextLimited(res, DEFAULT_MAX_BYTES);
  const plainText = htmlToPlainText(html);
  if (plainText.length < 40) return null;
  const title = extractTitle(html);
  const links = extractLinksFromHtml(html, normalized);
  const domain = getDomainFromUrl(normalized) ?? "";
  if (!domain) return null;

  return {
    url: normalized,
    statusCode,
    contentType,
    html,
    plainText,
    title,
    links,
    domain,
  };
}
