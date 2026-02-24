import { describe, expect, it } from "vitest";
import { sanitizeCustomizationInput } from "./sanitize";

describe("sanitizeCustomizationInput", () => {
  it("removes script tags and unsafe URLs from HTML", () => {
    const result = sanitizeCustomizationInput({
      customHtml:
        '<div><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://example.com/a.png" /></div>',
      customCss: "",
      customJs: "",
    });

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain('href="javascript:');
    expect(result.html).toContain("<img");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("filters unsafe CSS tokens", () => {
    const result = sanitizeCustomizationInput({
      customHtml: "",
      customCss: "body { color: red; } @import url('https://evil.test/a.css');",
      customJs: "",
    });

    expect(result.css).not.toMatch(/@import/i);
  });

  it("flags blocked JS patterns", () => {
    const result = sanitizeCustomizationInput({
      customHtml: "",
      customCss: "",
      customJs: "eval('x'); localStorage.setItem('a','b');",
    });

    expect(result.jsBlockedPatterns).toContain("eval()");
    expect(result.jsBlockedPatterns).toContain("localStorage");
  });
});
