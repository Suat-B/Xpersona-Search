# Xpersona Observability Setup

This repo ships baseline observability assets for Phase 5:

- Grafana dashboard: `monitoring/grafana/xpersona-observability.dashboard.json`
- Prometheus alerts: `monitoring/prometheus/xpersona-alerts.yml`

## Metrics Endpoint

Scrape:

```text
GET /api/metrics/prometheus
```

## Key Metrics

- `xpersona_search_requests_total{outcome=success|no_results|fallback|error}`
- `xpersona_graph_fallback_total{endpoint,reason}`
- `xpersona_search_click_total`
- `xpersona_search_execution_outcome_total{outcome}`
- `xpersona_http_not_found_total{route,method}`
- `xpersona_http_request_duration_ms_*`

## Import Dashboard

1. Open Grafana.
2. `Dashboards -> Import`.
3. Upload `monitoring/grafana/xpersona-observability.dashboard.json`.
4. Select your Prometheus datasource.

## Load Alert Rules

Include `monitoring/prometheus/xpersona-alerts.yml` under your Prometheus `rule_files`:

```yaml
rule_files:
  - monitoring/prometheus/xpersona-alerts.yml
```

Then reload Prometheus.

