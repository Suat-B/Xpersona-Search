/* eslint-disable no-console */

const DEFAULT_BASE_URL = "https://xpersona.co";

function usage() {
  console.log("Usage: node scripts/smoke-reliability.mjs [--base-url https://xpersona.co]");
}

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    process.exit(0);
  }

  const baseUrl = (getArgValue("--base-url") || process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const startedAt = Date.now();

  console.log(`[smoke] baseUrl=${baseUrl}`);

  // Page HTML
  {
    const url = `${baseUrl}/reliability`;
    const res = await fetch(url, { redirect: "follow" });
    const html = await res.text();
    assert(res.ok, `GET /reliability failed (${res.status})`);
    assert(html.includes("Xpersona Reliability"), "GET /reliability missing expected heading");
    console.log("[ok] GET /reliability");
  }

  // Browse
  const browse = await fetchJson(`${baseUrl}/api/v1/reliability/browse?limit=3`, { headers: { accept: "application/json" } });
  assert(browse.res.ok, `GET /api/v1/reliability/browse failed (${browse.res.status})`);
  assert(Array.isArray(browse.json?.results), "browse.results missing/invalid");
  assert(browse.json.results.length > 0, "browse.results empty");
  const first = browse.json.results[0];
  assert(typeof first?.id === "string" && first.id.length > 0, "browse.results[0].id invalid");
  assert(typeof first?.slug === "string" && first.slug.length > 0, "browse.results[0].slug invalid");
  console.log("[ok] GET /api/v1/reliability/browse");

  // Top
  const top = await fetchJson(`${baseUrl}/api/v1/reliability/top?limit=3`, { headers: { accept: "application/json" } });
  assert(top.res.ok, `GET /api/v1/reliability/top failed (${top.res.status})`);
  assert(Array.isArray(top.json?.results), "top.results missing/invalid");
  console.log("[ok] GET /api/v1/reliability/top");

  // Graph
  const graph = await fetchJson(`${baseUrl}/api/v1/reliability/graph`, { headers: { accept: "application/json" } });
  assert(graph.res.ok, `GET /api/v1/reliability/graph failed (${graph.res.status})`);
  assert(Array.isArray(graph.json?.clusters), "graph.clusters missing/invalid");
  assert(typeof graph.json?.sample_size === "number", "graph.sample_size missing/invalid");
  console.log("[ok] GET /api/v1/reliability/graph");

  // Agent
  {
    const slug = first.slug;
    const metrics = await fetchJson(`${baseUrl}/api/v1/reliability/agent/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    assert(metrics.res.ok, `GET /api/v1/reliability/agent/:id failed (${metrics.res.status})`);
    assert(metrics.json?.agentId, "agent metrics missing agentId");
    console.log("[ok] GET /api/v1/reliability/agent/:id");

    const trends = await fetchJson(`${baseUrl}/api/v1/reliability/agent/${encodeURIComponent(slug)}/trends`, {
      headers: { accept: "application/json" },
    });
    assert(trends.res.ok, `GET /api/v1/reliability/agent/:id/trends failed (${trends.res.status})`);
    console.log("[ok] GET /api/v1/reliability/agent/:id/trends");

    const suggest = await fetchJson(`${baseUrl}/api/v1/reliability/suggest/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
    assert(suggest.res.ok, `GET /api/v1/reliability/suggest/:agentId failed (${suggest.res.status})`);
    assert(Array.isArray(suggest.json?.recommended_actions), "suggest.recommended_actions missing/invalid");
    console.log("[ok] GET /api/v1/reliability/suggest/:agentId");
  }

  console.log(`[done] ${(Date.now() - startedAt)}ms`);
}

main().catch((err) => {
  console.error("[fail]", err?.message ?? err);
  process.exit(1);
});

