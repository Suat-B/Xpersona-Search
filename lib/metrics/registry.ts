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

function labelKey(labels: Record<string, string | number>): LabelKey {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("|");
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

function formatLabels(labels: Record<string, string | number>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${String(v)}"`).join(",")}}`;
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

  return lines.join("\n") + "\n";
}
