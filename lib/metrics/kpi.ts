import { incNamedCounter } from "@/lib/metrics/registry";

export function recordSearchOutcome(outcome: "success" | "no_results" | "error" | "fallback") {
  incNamedCounter("xpersona_search_requests_total", { outcome });
}

export function recordSearchClick() {
  incNamedCounter("xpersona_search_click_total");
}

export function recordSearchExecutionOutcome(
  outcome: "success" | "failure" | "timeout"
) {
  incNamedCounter("xpersona_search_execution_outcome_total", { outcome });
}

export function recordGraphFallback(
  endpoint: "recommend" | "plan" | "top" | "related",
  reason: "circuit_open" | "internal_error" | "upstream_error" | "stale_cache"
) {
  incNamedCounter("xpersona_graph_fallback_total", { endpoint, reason });
}
