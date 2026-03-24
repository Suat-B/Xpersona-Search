import {
  buildSearchPageKey,
  buildSearchScopeKey,
  getPrefetchOrder,
  getRequestVertical,
  isSkillsOnlyVertical,
  type ResolvedSearchState,
} from "@/components/home/searchTabState";

function buildState(overrides?: Partial<ResolvedSearchState>): ResolvedSearchState {
  return {
    query: "init",
    selectedProtocols: ["A2A", "MCP"],
    selectedCapabilities: ["agents", "retrieval"],
    minSafety: 25,
    sort: "popularity",
    vertical: "all",
    intent: "discover",
    taskType: "",
    maxLatencyMs: "",
    maxCostUsd: "",
    dataRegion: "global",
    requires: "",
    forbidden: "",
    bundle: false,
    explain: false,
    recall: "normal",
    includeSources: ["WEB", "GITHUB"],
    ...overrides,
  };
}

describe("searchTabState helpers", () => {
  it("builds the same scope key for equivalent filter sets regardless of selection order", () => {
    const left = buildSearchScopeKey(buildState());
    const right = buildSearchScopeKey(
      buildState({
        selectedProtocols: ["MCP", "A2A"],
        selectedCapabilities: ["retrieval", "agents"],
        includeSources: ["GITHUB", "WEB"],
      })
    );

    expect(left).toBe(right);
  });

  it("keeps all, agents, and skills in separate cache namespaces", () => {
    const allKey = buildSearchPageKey(buildSearchScopeKey(buildState({ vertical: "all" })), 1);
    const agentsKey = buildSearchPageKey(buildSearchScopeKey(buildState({ vertical: "agents" })), 1);
    const skillsKey = buildSearchPageKey(buildSearchScopeKey(buildState({ vertical: "skills" })), 1);

    expect(allKey).not.toBe(agentsKey);
    expect(allKey).not.toBe(skillsKey);
    expect(agentsKey).not.toBe(skillsKey);
  });

  it("returns the planned sibling prefetch order for each tab", () => {
    expect(getPrefetchOrder("all")).toEqual(["agents", "skills", "artifacts"]);
    expect(getPrefetchOrder("agents")).toEqual(["all", "skills", "artifacts"]);
    expect(getPrefetchOrder("skills")).toEqual(["all", "agents", "artifacts"]);
    expect(getPrefetchOrder("artifacts")).toEqual(["all", "agents", "skills"]);
  });

  it("maps mixed verticals onto the existing backend request modes", () => {
    expect(getRequestVertical("all")).toBe("agents");
    expect(getRequestVertical("skills")).toBe("agents");
    expect(getRequestVertical("agents")).toBe("agents");
    expect(getRequestVertical("artifacts")).toBe("artifacts");
    expect(isSkillsOnlyVertical("skills")).toBe(true);
    expect(isSkillsOnlyVertical("all")).toBe(false);
  });
});
