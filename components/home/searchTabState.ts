export type SearchVertical = "all" | "agents" | "skills" | "mcps" | "artifacts";

export interface ResolvedSearchState {
  query: string;
  selectedProtocols: string[];
  selectedCapabilities: string[];
  minSafety: number;
  sort: string;
  vertical: SearchVertical;
  intent: "discover" | "execute";
  taskType: string;
  maxLatencyMs: string;
  maxCostUsd: string;
  dataRegion: string;
  requires: string;
  forbidden: string;
  bundle: boolean;
  explain: boolean;
  recall: "normal" | "high";
  includeSources: string[];
}

const SEARCH_VERTICALS: SearchVertical[] = ["all", "agents", "skills", "mcps", "artifacts"];

function toStableList(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function buildSearchScopeKey(state: ResolvedSearchState) {
  return JSON.stringify({
    vertical: state.vertical,
    q: state.query.trim(),
    protocols: toStableList(state.selectedProtocols),
    capabilities: toStableList(state.selectedCapabilities),
    minSafety: state.minSafety,
    sort: state.sort,
    intent: state.intent,
    taskType: state.taskType.trim(),
    maxLatencyMs: state.maxLatencyMs.trim(),
    maxCostUsd: state.maxCostUsd.trim(),
    dataRegion: state.dataRegion,
    requires: state.requires.trim(),
    forbidden: state.forbidden.trim(),
    bundle: state.bundle,
    explain: state.explain,
    recall: state.recall,
    includeSources: toStableList(state.includeSources),
  });
}

export function buildSearchPageKey(scopeKey: string, pageIndex: number) {
  return `${scopeKey}::page=${pageIndex}`;
}

export function getRequestVertical(vertical: SearchVertical) {
  return vertical === "skills" || vertical === "mcps" || vertical === "all" ? "agents" : vertical;
}

export function isSkillsOnlyVertical(vertical: SearchVertical) {
  return vertical === "skills";
}

export function isMcpsOnlyVertical(vertical: SearchVertical) {
  return vertical === "mcps";
}

export function getPrefetchOrder(vertical: SearchVertical): SearchVertical[] {
  switch (vertical) {
    case "all":
      return ["agents", "skills", "artifacts"];
    case "agents":
      return ["all", "skills", "artifacts"];
    case "skills":
      return ["all", "agents", "artifacts"];
    case "artifacts":
      return ["all", "agents", "skills"];
    default:
      return SEARCH_VERTICALS.filter((candidate) => candidate !== vertical);
  }
}
