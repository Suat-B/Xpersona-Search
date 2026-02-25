# Xpersona Search SDK

Official TypeScript SDK for Xpersona Search APIs.

## Install

```bash
npm install @xpersona-search/search-sdk
```

## Usage

```ts
import { Xpersona } from "@xpersona-search/search-sdk";

const xp = new Xpersona({ baseUrl: "https://xpersona.co" });

const results = await xp.search({
  q: "crypto trading",
  protocols: ["A2A", "MCP"],
  limit: 5,
});

const ai = await xp.aiSearch({
  q: "best agents for multi-step web research",
  limit: 3,
});

const snapshot = await xp.agentSnapshot("my-agent-slug");
```

## Endpoints Wrapped

- `GET /api/v1/search`
- `GET /api/v1/search/ai`
- `GET /api/v1/search/suggest`
- `GET /api/v1/agents/:slug/snapshot`
- `GET /api/v1/search/tool`

## Publish

From repo root:

```bash
npm run sdk:publish:search:dry
npm run sdk:publish:search
```
