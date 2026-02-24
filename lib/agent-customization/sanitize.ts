export interface CustomCodeInput {
  customHtml?: string | null;
  customCss?: string | null;
  customJs?: string | null;
}

export interface SanitizedCustomization {
  html: string;
  css: string;
  js: string;
  warnings: string[];
  jsBlockedPatterns: string[];
}

export const CUSTOMIZATION_LIMITS = {
  maxHtmlBytes: 120_000,
  maxCssBytes: 80_000,
  maxJsBytes: 80_000,
  maxWidgetCount: 100,
} as const;

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "iframe",
  "img",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const GLOBAL_ALLOWED_ATTRS = new Set([
  "class",
  "id",
  "title",
  "aria-label",
  "aria-hidden",
  "role",
  "style",
]);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding"]),
  iframe: new Set(["src", "title", "width", "height", "allow", "allowfullscreen", "loading"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

const SAFE_URL_PROTOCOLS = ["http:", "https:", "mailto:"];
const SAFE_IMG_PROTOCOLS = ["http:", "https:", "data:"];
const SAFE_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "player.vimeo.com",
  "www.loom.com",
];

const FORBIDDEN_CSS_PATTERNS: Array<[RegExp, string]> = [
  [/@import/gi, "@import"],
  [/expression\s*\(/gi, "expression()"],
  [/javascript:/gi, "javascript:"],
  [/-moz-binding/gi, "-moz-binding"],
  [/behavior\s*:/gi, "behavior:"],
];

const BLOCKED_JS_PATTERNS: Array<[RegExp, string]> = [
  [/\beval\s*\(/gi, "eval()"],
  [/\bnew\s+Function\b/gi, "new Function"],
  [/\bFunction\s*\(/gi, "Function()"],
  [/\bdocument\.cookie\b/gi, "document.cookie"],
  [/\blocalStorage\b/gi, "localStorage"],
  [/\bsessionStorage\b/gi, "sessionStorage"],
  [/\bXMLHttpRequest\b/gi, "XMLHttpRequest"],
  [/\bWebSocket\b/gi, "WebSocket"],
  [/\bnavigator\.sendBeacon\b/gi, "navigator.sendBeacon"],
];

function byteLength(input: string): number {
  return Buffer.byteLength(input, "utf8");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(url: string, forImage = false): boolean {
  try {
    const parsed = new URL(url, "https://xpersona.co");
    const allowed = forImage ? SAFE_IMG_PROTOCOLS : SAFE_URL_PROTOCOLS;
    return allowed.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isSafeIframeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["https:"].includes(parsed.protocol)) return false;
    return SAFE_IFRAME_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sanitizeInlineStyle(style: string, warnings: string[]): string {
  let clean = style;
  for (const [pattern, label] of FORBIDDEN_CSS_PATTERNS) {
    if (pattern.test(clean)) {
      warnings.push(`Removed unsafe inline CSS pattern: ${label}`);
      clean = clean.replace(pattern, "");
    }
  }
  return clean.trim();
}

function sanitizeHtml(input: string, warnings: string[]): string {
  let html = input;

  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, () => {
    warnings.push("Removed <script> block.");
    return "";
  });

  html = html.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (raw, tagName: string, attrPart: string) => {
    const lowerTag = tagName.toLowerCase();
    const isClosing = raw.startsWith("</");

    if (!ALLOWED_TAGS.has(lowerTag)) {
      warnings.push(`Removed disallowed tag: <${isClosing ? "/" : ""}${lowerTag}>`);
      return "";
    }

    if (isClosing) {
      return `</${lowerTag}>`;
    }

    const attrs: string[] = [];
    const attrRegex = /([:@a-zA-Z0-9_-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attrPart))) {
      const attrName = match[1].toLowerCase();
      const value = (match[3] ?? match[4] ?? match[5] ?? "").trim();

      if (attrName.startsWith("on")) {
        warnings.push(`Removed event handler attribute: ${attrName}`);
        continue;
      }

      const allowedForTag = TAG_ATTRS[lowerTag];
      if (!GLOBAL_ALLOWED_ATTRS.has(attrName) && !(allowedForTag && allowedForTag.has(attrName))) {
        continue;
      }

      if (attrName === "href") {
        if (!isSafeUrl(value, false)) {
          warnings.push(`Removed unsafe href URL on <${lowerTag}>.`);
          continue;
        }
      }

      if (attrName === "src") {
        if (lowerTag === "img" && !isSafeUrl(value, true)) {
          warnings.push("Removed unsafe image source URL.");
          continue;
        }
        if (lowerTag === "iframe" && !isSafeIframeUrl(value)) {
          warnings.push("Removed unsafe iframe source URL.");
          continue;
        }
      }

      if (attrName === "style") {
        const cleanStyle = sanitizeInlineStyle(value, warnings);
        if (!cleanStyle) continue;
        attrs.push(`style="${escapeHtml(cleanStyle)}"`);
        continue;
      }

      if (!value) {
        attrs.push(attrName);
      } else {
        attrs.push(`${attrName}="${escapeHtml(value)}"`);
      }
    }

    const selfClose = /\/>$/.test(raw);
    const attrText = attrs.length ? ` ${attrs.join(" ")}` : "";
    return selfClose ? `<${lowerTag}${attrText} />` : `<${lowerTag}${attrText}>`;
  });

  return html.trim();
}

function sanitizeCss(input: string, warnings: string[]): string {
  let css = input;

  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const [pattern, label] of FORBIDDEN_CSS_PATTERNS) {
    if (pattern.test(css)) {
      warnings.push(`Removed unsafe CSS pattern: ${label}`);
      css = css.replace(pattern, "");
    }
  }

  return css.trim();
}

function validateJs(input: string): { clean: string; blocked: string[] } {
  const blocked = BLOCKED_JS_PATTERNS
    .filter(([pattern]) => pattern.test(input))
    .map(([, label]) => label);

  return { clean: input.trim(), blocked };
}

function ensureSizeLimit(value: string, maxBytes: number, field: string) {
  if (byteLength(value) > maxBytes) {
    throw new Error(`${field} exceeds maximum size of ${maxBytes} bytes.`);
  }
}

export function sanitizeCustomizationInput(
  input: CustomCodeInput
): SanitizedCustomization {
  const rawHtml = input.customHtml ?? "";
  const rawCss = input.customCss ?? "";
  const rawJs = input.customJs ?? "";

  ensureSizeLimit(rawHtml, CUSTOMIZATION_LIMITS.maxHtmlBytes, "customHtml");
  ensureSizeLimit(rawCss, CUSTOMIZATION_LIMITS.maxCssBytes, "customCss");
  ensureSizeLimit(rawJs, CUSTOMIZATION_LIMITS.maxJsBytes, "customJs");

  const warnings: string[] = [];
  const html = sanitizeHtml(rawHtml, warnings);
  const css = sanitizeCss(rawCss, warnings);
  const jsValidation = validateJs(rawJs);

  return {
    html,
    css,
    js: jsValidation.clean,
    warnings,
    jsBlockedPatterns: jsValidation.blocked,
  };
}
