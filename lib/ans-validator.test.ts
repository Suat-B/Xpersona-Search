import { describe, it, expect } from "vitest";
import {
  validateAgentName,
  sanitizeAgentName,
  getSuggestions,
} from "./ans-validator";

describe("validateAgentName", () => {
  it("accepts valid names", () => {
    expect(validateAgentName("kimi").valid).toBe(true);
    expect(validateAgentName("alpha-bot").valid).toBe(true);
    expect(validateAgentName("agent123").valid).toBe(true);
    expect(validateAgentName("my-agent-42").valid).toBe(true);
  });

  it("rejects reserved names", () => {
    expect(validateAgentName("www").valid).toBe(false);
    expect(validateAgentName("api").valid).toBe(false);
    expect(validateAgentName("xpersona").valid).toBe(false);
    expect(validateAgentName("admin").valid).toBe(false);
    expect(validateAgentName("test").valid).toBe(false);
  });

  it("rejects invalid length", () => {
    expect(validateAgentName("ab").valid).toBe(false);
    expect(validateAgentName("a").valid).toBe(false);
    expect(validateAgentName("").valid).toBe(false);
  });

  it("rejects invalid format", () => {
    expect(validateAgentName("-invalid").valid).toBe(false);
    expect(validateAgentName("invalid-").valid).toBe(false);
    expect(validateAgentName("invalid--name").valid).toBe(false);
    expect(validateAgentName("inval!d").valid).toBe(false);
    expect(validateAgentName("has space").valid).toBe(false);
    expect(validateAgentName("has.special").valid).toBe(false);
  });

  it("returns correct error codes", () => {
    expect(validateAgentName("").code).toBe("EMPTY");
    expect(validateAgentName("ab").code).toBe("INVALID_LENGTH");
    expect(validateAgentName("-x").code).toBe("INVALID_FORMAT");
    expect(validateAgentName("www").code).toBe("RESERVED_NAME");
    expect(validateAgentName("a--b").code).toBe("CONSECUTIVE_HYPHENS");
  });

  it("returns normalized name on valid input", () => {
    const r = validateAgentName("Kimi");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("kimi");
  });
});

describe("sanitizeAgentName", () => {
  it("lowercases and trims", () => {
    expect(sanitizeAgentName("  Kimi  ")).toBe("kimi");
  });

  it("strips disallowed characters", () => {
    expect(sanitizeAgentName("kim@i!")).toBe("kimi");
  });

  it("removes leading and trailing hyphens", () => {
    expect(sanitizeAgentName("--kimi--")).toBe("kimi");
  });
});

describe("getSuggestions", () => {
  it("returns alternative names for taken domain", () => {
    const s = getSuggestions("kimi");
    expect(s).toContain("kimi-agent");
    expect(s).toContain("kimi-bot");
    expect(s).toContain("my-kimi");
  });

  it("returns suggestions for long base names", () => {
    const long = "a".repeat(60);
    const s = getSuggestions(long);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.endsWith("-agent") || x.endsWith("-bot") || x.startsWith("my-"))).toBe(true);
  });
});
