# Cutie and OpenHands orchestration

This document describes how the **Cutie product** (VS Code extension + Xpersona Next.js API) routes model work, and how to maximize use of the **OpenHands gateway**.

## Architecture constraint

Workspace **tools** (`read_file`, `edit`, `run_command`, etc.) are executed in the **VS Code extension**. The server cannot run a closed loop without the client posting tool results on `/continue`. So “orchestration” means: the **gateway chooses** the next tool or final text each turn; the **extension** runs tools and returns results.

## Extension composer runtimes (`cutie-product.binary.runtime`)

| Runtime        | Orchestrator                                      | OpenHands? |
|----------------|---------------------------------------------------|------------|
| `playgroundApi` (default) | `POST /api/v1/playground/assist` → tool loop → gateway | Yes (per turn), if server has `OPENHANDS_GATEWAY_URL` |
| `cutie`        | Local `CutieRuntime`                              | No         |
| `qwenCode`     | Local Qwen CLI/SDK                                | No         |

Use **playgroundApi** for hosted OpenHands-backed chat.

## Server: `/api/v1/playground/assist`

Implemented in `app/api/v1/playground/assist/route.ts`.

| Request shape | Default behavior | OpenHands gateway? |
|---------------|------------------|--------------------|
| `mode: auto`, normal coding | `startAssistToolLoop` | Yes (if gateway configured) |
| `mode: auto`, trivial greeting only | `runAssist` → `callDefaultModel` | No |
| `mode: plan` | `runAssist` → `callDefaultModel` | No |

### Optional: route greeting/plan through the gateway

When the gateway is enabled, you can set:

- `PLAYGROUND_ASSIST_GREETING_VIA_GATEWAY=true` — trivial greetings use `startAssistToolLoop` (same path as normal auto).
- `PLAYGROUND_ASSIST_PLAN_VIA_GATEWAY=true` — `mode: plan` uses `startAssistToolLoop`.

If the gateway is **not** configured, those branches **fall back** to `runAssist` (no hard failure for greetings).

See `.env.example` for all related variables.

## Thinning Xpersona policy around the gateway

`lib/playground/tool-loop.ts` can apply observation primers, mutation/repair gates, etc. When:

`PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION=true`

…many of those layers are skipped (`lib/playground/openhands-primary-orchestration.ts`), so the gateway’s turn output is forwarded with minimal second-guessing. Limits, persistence, and client tool execution remain in Node/extension.

## OpenHands gateway service

The Python service under `services/openhands-gateway/` may use different internal paths per model (e.g. HF Router `chat/completions` vs OpenHands SDK `ask_agent`). From Xpersona’s perspective, all tool-loop turns go through the same gateway HTTP API.

## Related code

- `lib/playground/assist-openhands-routing.ts` — greeting/plan gateway flags
- `lib/playground/tool-loop-adapters.ts` — `requestToolLoopTurn` → OpenHands
- `lib/playground/openhands-gateway.ts` — gateway client
- `cutie-product.cutie-product-1.0.1/src/config.ts` — `getBinaryIdeChatRuntime()`
