import { describe, expect, it } from "vitest";
import {
  boundedEngagementScore,
  composeHybridScore,
} from "../hybrid-rank";

describe("hybrid rank scoring", () => {
  it("keeps lexical dominance with default weights", () => {
    const strongLexical = composeHybridScore({
      lexical: 0.95,
      authority: 0.4,
      engagement: 0.2,
      freshness: 0.3,
    });
    const weakLexical = composeHybridScore({
      lexical: 0.3,
      authority: 0.9,
      engagement: 0.8,
      freshness: 0.8,
    });
    expect(strongLexical).toBeGreaterThan(weakLexical);
  });

  it("lets authority outrank close lexical ties", () => {
    const higherAuthority = composeHybridScore({
      lexical: 0.7,
      authority: 0.9,
      engagement: 0.1,
      freshness: 0.1,
    });
    const lowerAuthority = composeHybridScore({
      lexical: 0.72,
      authority: 0.2,
      engagement: 0.1,
      freshness: 0.1,
    });
    expect(higherAuthority).toBeGreaterThan(lowerAuthority);
  });

  it("bounds engagement score", () => {
    expect(boundedEngagementScore(0, 100)).toBe(0);
    expect(boundedEngagementScore(1000, 1000)).toBeLessThanOrEqual(1);
  });

  it("increases engagement as clicks and impressions increase", () => {
    const low = boundedEngagementScore(2, 50);
    const high = boundedEngagementScore(20, 200);
    expect(high).toBeGreaterThan(low);
  });
});
