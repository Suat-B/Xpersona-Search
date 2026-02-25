type LabelKey = string;

type CounterState = {
  byLabel: Map<LabelKey, number>;
};

type HistogramState = {
  buckets: number[];
  byLabel: Map<
    LabelKey,
    {
      bucketCounts: number[];
      sum: number;
      count: number;
    }
  >;
};

const requestCounter: CounterState = {
  byLabel: new Map(),
};

const durationHistogram: HistogramState = {
  buckets: [10, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800],
  byLabel: new Map(),
};

const namedCounters: Map<string, Map<LabelKey, number>> = new Map();

function labelKey(labels: Record<string, string | number>): LabelKey {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("|");
}

function parseLabelKey(key: LabelKey): Record<string, string> {
  return Object.fromEntries(
    key
      .split("|")
      .filter(Boolean)
      .map((part) => {
        const [k, v] = part.split("=");
        return [k, v ?? ""];
      })
  ) as Record<string, string>;
}

export function incRequest(labels: { route: string; method: string; status: number }) {
  const key = labelKey(labels);
  const current = requestCounter.byLabel.get(key) ?? 0;
  requestCounter.byLabel.set(key, current + 1);
}

export function observeDuration(
  labels: { route: string; method: string; status: number },
  durationMs: number
) {
  const key = labelKey(labels);
  const existing = durationHistogram.byLabel.get(key);
  if (!existing) {
    durationHistogram.byLabel.set(key, {
      bucketCounts: new Array(durationHistogram.buckets.length).fill(0),
      sum: 0,
      count: 0,
    });
  }
  const state = durationHistogram.byLabel.get(key);
  if (!state) return;

  for (let i = 0; i < durationHistogram.buckets.length; i += 1) {
    if (durationMs <= durationHistogram.buckets[i]) {
      state.bucketCounts[i] += 1;
    }
  }
  state.sum += durationMs;
  state.count += 1;
}

export function incNamedCounter(
  metric: string,
  labels: Record<string, string | number> = {}
) {
  const perMetric = namedCounters.get(metric) ?? new Map<LabelKey, number>();
  const key = labelKey(labels);
  perMetric.set(key, (perMetric.get(key) ?? 0) + 1);
  namedCounters.set(metric, perMetric);
}

function formatLabels(labels: Record<string, string | number>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${String(v)}"`).join(",")}}`;
}

export type KpiSnapshot = {
  searchRequests: {
    success: number;
    noResults: number;
    error: number;
    fallback: number;
    total: number;
  };
  searchExecutionOutcomes: {
    success: number;
    failure: number;
    timeout: number;
    total: number;
  };
  graphFallbacks: {
    recommend: number;
    plan: number;
    top: number;
    related: number;
    total: number;
  };
  clickThroughRate: number | null;
  noResultRate: number | null;
  top404: Array<{ route: string; method: string; count: number }>;
};

function readNamedCounter(metric: string, labels: Record<string, string>): number {
  const byLabel = namedCounters.get(metric);
  if (!byLabel) return 0;
  const key = labelKey(labels);
  return byLabel.get(key) ?? 0;
}

export function getKpiSnapshot(top404Limit = 10): KpiSnapshot {
  const searchSuccess = readNamedCounter("xpersona_search_requests_total", { outcome: "success" });
  const searchNoResults = readNamedCounter("xpersona_search_requests_total", { outcome: "no_results" });
  const searchError = readNamedCounter("xpersona_search_requests_total", { outcome: "error" });
  const searchFallback = readNamedCounter("xpersona_search_requests_total", { outcome: "fallback" });
  const searchTotal = searchSuccess + searchNoResults + searchError + searchFallback;

  const execSuccess = readNamedCounter("xpersona_search_execution_outcome_total", { outcome: "success" });
  const execFailure = readNamedCounter("xpersona_search_execution_outcome_total", { outcome: "failure" });
  const execTimeout = readNamedCounter("xpersona_search_execution_outcome_total", { outcome: "timeout" });
  const execTotal = execSuccess + execFailure + execTimeout;

  const graphRecommend = readNamedCounter("xpersona_graph_fallback_total", { endpoint: "recommend", reason: "circuit_open" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "recommend", reason: "internal_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "recommend", reason: "upstream_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "recommend", reason: "stale_cache" });
  const graphPlan = readNamedCounter("xpersona_graph_fallback_total", { endpoint: "plan", reason: "circuit_open" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "plan", reason: "internal_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "plan", reason: "upstream_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "plan", reason: "stale_cache" });
  const graphTop = readNamedCounter("xpersona_graph_fallback_total", { endpoint: "top", reason: "circuit_open" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "top", reason: "internal_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "top", reason: "upstream_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "top", reason: "stale_cache" });
  const graphRelated = readNamedCounter("xpersona_graph_fallback_total", { endpoint: "related", reason: "circuit_open" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "related", reason: "internal_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "related", reason: "upstream_error" })
    + readNamedCounter("xpersona_graph_fallback_total", { endpoint: "related", reason: "stale_cache" });
  const graphTotal = graphRecommend + graphPlan + graphTop + graphRelated;

  const clicks = readNamedCounter("xpersona_search_click_total", {});

  const top404 = [...requestCounter.byLabel.entries()]
    .map(([key, count]) => ({ labels: parseLabelKey(key), count }))
    .filter((entry) => entry.labels.status === "404")
    .sort((a, b) => b.count - a.count)
    .slice(0, top404Limit)
    .map((entry) => ({
      route: entry.labels.route ?? "",
      method: entry.labels.method ?? "",
      count: entry.count,
    }));

  return {
    searchRequests: {
      success: searchSuccess,
      noResults: searchNoResults,
      error: searchError,
      fallback: searchFallback,
      total: searchTotal,
    },
    searchExecutionOutcomes: {
      success: execSuccess,
      failure: execFailure,
      timeout: execTimeout,
      total: execTotal,
    },
    graphFallbacks: {
      recommend: graphRecommend,
      plan: graphPlan,
      top: graphTop,
      related: graphRelated,
      total: graphTotal,
    },
    clickThroughRate: searchTotal > 0 ? clicks / searchTotal : null,
    noResultRate: searchTotal > 0 ? searchNoResults / searchTotal : null,
    top404,
  };
}

export function renderPrometheus(): string {
  const lines: string[] = [];

  lines.push("# HELP xpersona_http_requests_total Total HTTP requests.");
  lines.push("# TYPE xpersona_http_requests_total counter");
  for (const [key, value] of requestCounter.byLabel.entries()) {
    const labels = Object.fromEntries(
      key.split("|").map((part) => {
        const [k, v] = part.split("=");
        return [k, v ?? ""];
      })
    ) as Record<string, string>;
    lines.push(`xpersona_http_requests_total${formatLabels(labels)} ${value}`);
  }

  lines.push("# HELP xpersona_http_request_duration_ms Request duration in milliseconds.");
  lines.push("# TYPE xpersona_http_request_duration_ms histogram");
  for (const [key, state] of durationHistogram.byLabel.entries()) {
    const labels = Object.fromEntries(
      key.split("|").map((part) => {
        const [k, v] = part.split("=");
        return [k, v ?? ""];
      })
    ) as Record<string, string>;

    let cumulative = 0;
    for (let i = 0; i < durationHistogram.buckets.length; i += 1) {
      cumulative += state.bucketCounts[i];
      const bucket = durationHistogram.buckets[i];
      lines.push(
        `xpersona_http_request_duration_ms_bucket${formatLabels({
          ...labels,
          le: bucket,
        })} ${cumulative}`
      );
    }
    lines.push(
      `xpersona_http_request_duration_ms_bucket${formatLabels({
        ...labels,
        le: "+Inf",
      })} ${state.count}`
    );
    lines.push(`xpersona_http_request_duration_ms_sum${formatLabels(labels)} ${state.sum}`);
    lines.push(`xpersona_http_request_duration_ms_count${formatLabels(labels)} ${state.count}`);
  }

  lines.push("# HELP xpersona_http_not_found_total Total HTTP 404 responses.");
  lines.push("# TYPE xpersona_http_not_found_total counter");
  for (const [key, value] of requestCounter.byLabel.entries()) {
    const labels = parseLabelKey(key);
    if (labels.status !== "404") continue;
    lines.push(
      `xpersona_http_not_found_total${formatLabels({
        route: labels.route ?? "",
        method: labels.method ?? "",
      })} ${value}`
    );
  }

  for (const [metric, byLabel] of namedCounters.entries()) {
    lines.push(`# HELP ${metric} Custom application counter.`);
    lines.push(`# TYPE ${metric} counter`);
    for (const [key, value] of byLabel.entries()) {
      lines.push(`${metric}${formatLabels(parseLabelKey(key))} ${value}`);
    }
  }

  return lines.join("\n") + "\n";
}
