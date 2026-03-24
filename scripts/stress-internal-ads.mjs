const DEFAULTS = {
  baseUrl: "http://localhost:3000",
  requests: 1000,
  concurrency: 25,
  discoveryRatio: 0.1,
  clickRatio: 0.1,
  timeoutMs: 8000,
  userAgent: "XpersonaAdStress/1.0 (+internal-load-test)",
  adIds: ["xp-agents-1", "xp-search-2", "xp-playground-3"],
};

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  return hit.slice(prefix.length);
}

function numberArg(name, fallback) {
  const raw = argValue(name, String(fallback));
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function parseAdIds(raw) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function chooseAdId(ids) {
  return ids[Math.floor(Math.random() * ids.length)] ?? DEFAULTS.adIds[0];
}

function choosePath(config) {
  const roll = Math.random();
  if (roll < config.discoveryRatio) {
    return "/api/v1/ad";
  }
  const adId = encodeURIComponent(chooseAdId(config.adIds));
  if (roll < config.discoveryRatio + config.clickRatio) {
    return `/api/v1/ad/click/${adId}`;
  }
  return `/api/v1/ad/impression/${adId}`;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const baseUrl = String(argValue("base-url", DEFAULTS.baseUrl)).replace(/\/+$/, "");
  const requests = Math.max(1, Math.floor(numberArg("requests", DEFAULTS.requests)));
  const concurrency = Math.max(1, Math.floor(numberArg("concurrency", DEFAULTS.concurrency)));
  const discoveryRatio = clampRatio(numberArg("discovery-ratio", DEFAULTS.discoveryRatio));
  const clickRatio = clampRatio(numberArg("click-ratio", DEFAULTS.clickRatio));
  const timeoutMs = Math.max(1000, Math.floor(numberArg("timeout-ms", DEFAULTS.timeoutMs)));
  const adIds = parseAdIds(String(argValue("ad-ids", DEFAULTS.adIds.join(","))));
  const userAgent = String(argValue("user-agent", DEFAULTS.userAgent));

  if (discoveryRatio + clickRatio > 1) {
    console.error("Invalid ratios: discovery-ratio + click-ratio must be <= 1");
    process.exit(1);
  }
  if (adIds.length === 0) {
    console.error("No ad ids configured. Pass --ad-ids=id1,id2");
    process.exit(1);
  }

  const config = {
    baseUrl,
    requests,
    discoveryRatio,
    clickRatio,
    timeoutMs,
    adIds,
  };

  const statuses = new Map();
  let ok = 0;
  let failed = 0;
  let nextIndex = 0;
  const startedAt = Date.now();

  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= requests) return;
      const path = choosePath(config);
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "GET",
            headers: {
              "user-agent": userAgent,
              accept: "*/*",
            },
            redirect: "manual",
          },
          timeoutMs
        );

        const key = String(res.status);
        statuses.set(key, (statuses.get(key) ?? 0) + 1);
        if (res.ok || (res.status >= 300 && res.status < 400)) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        statuses.set("error", (statuses.get("error") ?? 0) + 1);
        failed += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, requests) }, () => worker());
  await Promise.all(workers);

  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const rps = (requests / elapsedMs) * 1000;

  const statusSummary = [...statuses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");

  console.log("Internal ads stress run complete");
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`requests: ${requests}`);
  console.log(`concurrency: ${Math.min(concurrency, requests)}`);
  console.log(`elapsedMs: ${elapsedMs}`);
  console.log(`requestsPerSecond: ${rps.toFixed(2)}`);
  console.log(`okLikeResponses: ${ok}`);
  console.log(`failedResponses: ${failed}`);
  console.log(`statusCounts: ${statusSummary || "none"}`);
}

main().catch((error) => {
  console.error("stress-internal-ads failed", error);
  process.exit(1);
});
