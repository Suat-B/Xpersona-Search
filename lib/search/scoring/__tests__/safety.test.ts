/**
 * Unit tests for safety scoring. Per Xpersona-Search-Full-Implementation-Plan.md:
 * "Mock repo + skillContent with eval( -> expect score < 100"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateSafetyScore } from "../safety";
import type { GitHubRepo } from "../../../utils/github";

vi.mock("../../utils/github", () => ({
  checkFileExists: vi.fn(),
  checkDirectoryExists: vi.fn(),
  checkGlobExists: vi.fn(),
}));

import {
  checkFileExists,
  checkDirectoryExists,
  checkGlobExists,
} from "../../utils/github";

const mockRepo: GitHubRepo = {
  id: 1,
  full_name: "owner/repo",
  name: "repo",
  description: "Test repo",
  html_url: "https://github.com/owner/repo",
  stargazers_count: 50,
  forks_count: 2,
  updated_at: new Date().toISOString(),
  pushed_at: new Date().toISOString(),
  default_branch: "main",
  fork: false,
};

describe("calculateSafetyScore", () => {
  beforeEach(() => {
    vi.mocked(checkFileExists).mockResolvedValue(true);
    vi.mocked(checkDirectoryExists).mockResolvedValue(false);
    vi.mocked(checkGlobExists).mockResolvedValue(true);
  });

  it("returns score < 100 when skillContent contains eval(", async () => {
    const skillContent = `---
name: Unsafe Skill
---
Some code that uses eval( for dynamic execution.`;
    const score = await calculateSafetyScore(mockRepo, skillContent);
    expect(score).toBeLessThan(100);
  });

  it("returns score < 100 when skillContent contains child_process.exec", async () => {
    const skillContent = `---
name: Exec Skill
---
child_process.exec('ls');`;
    const score = await calculateSafetyScore(mockRepo, skillContent);
    expect(score).toBeLessThan(100);
  });

  it("returns score 100 for clean skill when all checks pass", async () => {
    const skillContent = `---
name: Safe Skill
---
Clean code with no suspicious patterns.`;
    const score = await calculateSafetyScore(mockRepo, skillContent);
    expect(score).toBe(100);
  });

  it("reduces score when repo lacks license", async () => {
    vi.mocked(checkFileExists).mockImplementation(async (_, path) =>
      path === "LICENSE" ? false : true
    );
    vi.mocked(checkGlobExists).mockResolvedValue(false);
    const skillContent = `---
name: No License
---
Clean code.`;
    const score = await calculateSafetyScore(mockRepo, skillContent);
    expect(score).toBeLessThan(100);
  });

  it("reduces score for fork repos", async () => {
    vi.mocked(checkFileExists).mockResolvedValue(false);
    vi.mocked(checkGlobExists).mockResolvedValue(false);
    const forkRepo: GitHubRepo = { ...mockRepo, fork: true };
    const skillContent = `---
name: Fork Skill
---
Clean.`;
    const score = await calculateSafetyScore(forkRepo, skillContent);
    expect(score).toBeLessThan(100);
  });

  it("reduces score for unmaintained repos (90+ days since push)", async () => {
    vi.mocked(checkFileExists).mockResolvedValue(false);
    vi.mocked(checkGlobExists).mockResolvedValue(false);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const unmaintainedRepo: GitHubRepo = {
      ...mockRepo,
      pushed_at: oldDate.toISOString(),
    };
    const skillContent = `---
name: Old Skill
---
Clean.`;
    const score = await calculateSafetyScore(unmaintainedRepo, skillContent);
    expect(score).toBeLessThan(100);
  });
});
