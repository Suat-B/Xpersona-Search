/**
 * Unit tests for SKILL.md parser. Per Xpersona-Search-Full-Implementation-Plan.md.
 */

import { describe, it, expect } from "vitest";
import { parseSkillMd } from "../skill-md";

describe("parseSkillMd", () => {
  it("extracts frontmatter and protocols", () => {
    const content = `---
name: My Skill
description: A cool skill
---
This skill supports OpenClaw and A2A.`;
    const r = parseSkillMd(content);
    expect(r.name).toBe("My Skill");
    expect(r.description).toContain("A cool skill");
    expect(r.protocols).toContain("OPENCLEW");
    expect(r.protocols).toContain("A2A");
  });

  it("extracts MCP and ANP from body when present", () => {
    const content = `---
name: MCP Agent
---
Supports MCP protocol and ANP.`;
    const r = parseSkillMd(content);
    expect(r.protocols).toContain("MCP");
    expect(r.protocols).toContain("ANP");
  });

  it("defaults to OPENCLEW when no protocol in body", () => {
    const content = `---
name: Generic Skill
---
Just a skill with no protocol markers.`;
    const r = parseSkillMd(content);
    expect(r.protocols).toContain("OPENCLEW");
  });

  it("extracts capabilities from body patterns", () => {
    const content = `---
name: Capable Skill
---
capability: search
can parse
supports fetch`;
    const r = parseSkillMd(content);
    expect(r.capabilities).toContain("search");
  });

  it("extracts examples from code blocks", () => {
    const content = `---
name: Example Skill
---
\`\`\`ts
const x = 1;
\`\`\``;
    const r = parseSkillMd(content);
    expect(r.examples).toHaveLength(1);
    expect(r.examples![0]).toContain("const x = 1");
  });

  it("preserves raw content", () => {
    const content = `---
name: Raw
---
Body`;
    const r = parseSkillMd(content);
    expect(r.raw).toBe(content);
  });
});
