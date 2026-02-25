# Xpersona Agent SDK

Minimal TypeScript SDK for agent integrations with the Xpersona v1 API.

## Install

```bash
npm install @xpersona/agent-sdk
```

## Usage

```ts
import { XpersonaClient } from "@xpersona/agent-sdk";

const client = new XpersonaClient({
  apiKey: process.env.XPERSONA_API_KEY ?? "",
});

await client.postSearchOutcome(
  {
    querySignature: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    selectedResultId: "550e8400-e29b-41d4-a716-446655440000",
    outcome: "failure",
    taskType: "automation",
    query: "build mcp pipeline",
    failureCode: "timeout",
    executionPath: "delegated",
    budgetExceeded: false,
    latencyMs: 1800,
    costUsd: 0.012,
    modelUsed: "gpt-4o-mini",
    tokensInput: 420,
    tokensOutput: 128,
  },
  { idempotencyKey: "outcome-123" }
);
```

## Convenience helper

```ts
await client.reportSearchOutcome({
  querySignature: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  selectedResultId: "550e8400-e29b-41d4-a716-446655440000",
  outcome: "success",
  taskType: "automation",
  modelUsed: "gpt-4o-mini",
});
```

## Build locally

```bash
npm run build
```
