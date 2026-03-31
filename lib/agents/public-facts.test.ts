import { describe, expect, it } from "vitest";
import { combinePublicEvidence, selectStoredFirstEvidence } from "@/lib/agents/public-facts";

const derivedFact = {
  factKey: "derived_key",
  label: "Derived",
  value: "Derived value",
  category: "identity" as const,
  href: null,
  sourceUrl: "https://example.com/derived",
  sourceType: "derived" as const,
  confidence: "medium" as const,
  observedAt: "2026-03-24T00:00:00.000Z",
  isPublic: true,
};

const storedFact = {
  ...derivedFact,
  factKey: "stored_key",
  label: "Stored",
  value: "Stored value",
  sourceUrl: "https://example.com/stored",
};

const derivedEvent = {
  eventType: "release" as const,
  title: "Derived event",
  description: null,
  href: null,
  sourceUrl: "https://example.com/derived-event",
  sourceType: "derived" as const,
  confidence: "medium" as const,
  observedAt: "2026-03-24T00:00:00.000Z",
  isPublic: true,
};

const storedEvent = {
  ...derivedEvent,
  title: "Stored event",
  sourceUrl: "https://example.com/stored-event",
};

describe("selectStoredFirstEvidence", () => {
  it("prefers stored evidence when persisted rows exist", () => {
    const selected = selectStoredFirstEvidence({
      storedFacts: [storedFact],
      storedEvents: [storedEvent],
      derivedFacts: [derivedFact],
      derivedEvents: [derivedEvent],
    });

    expect(selected.facts[0]?.label).toBe("Stored");
    expect(selected.changeEvents[0]?.title).toBe("Stored event");
  });

  it("falls back to derived evidence when stored rows are absent", () => {
    const selected = selectStoredFirstEvidence({
      storedFacts: [],
      storedEvents: [],
      derivedFacts: [derivedFact],
      derivedEvents: [derivedEvent],
    });

    expect(selected.facts[0]?.label).toBe("Derived");
    expect(selected.changeEvents[0]?.title).toBe("Derived event");
  });
});

describe("combinePublicEvidence", () => {
  it("merges stored and derived evidence, dedupes, and sorts by recency", () => {
    const merged = combinePublicEvidence({
      storedFacts: [storedFact, derivedFact],
      storedEvents: [storedEvent],
      derivedFacts: [
        {
          ...derivedFact,
          factKey: "newer_derived_key",
          label: "Newer Derived",
          value: "Newer derived value",
          observedAt: "2026-03-25T00:00:00.000Z",
        },
      ],
      derivedEvents: [
        derivedEvent,
        {
          ...derivedEvent,
          title: "Newest derived event",
          observedAt: "2026-03-26T00:00:00.000Z",
        },
      ],
    });

    expect(merged.facts).toHaveLength(3);
    expect(merged.facts[0]?.label).toBe("Newer Derived");
    expect(merged.changeEvents).toHaveLength(3);
    expect(merged.changeEvents[0]?.title).toBe("Newest derived event");
  });
});
