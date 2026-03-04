# Playground AI CLI Implementation Plan

Date: March 4, 2026  
Inputs: `docs/AGENTIC_CODING_MARKETING_PLAN_2026.md`, `HF_ROUTER_IMPLEMENTATION_SUMMARY.md`

## 1) Locked Decisions

- Product brand: **Playground AI**
- Delivery: **dual runtime** (Node and Python)
- Scope: **power-user first** (not minimal)
- Default behavior: **auto-execute safe actions**
- API surface: **Playground endpoints + HF router**
- Monetization: **hard paywall after first successful run**, enforced server-side
- Runtime strategy: **shared core contract + thin runtime wrappers**

## 2) Branding Spec (CLI)

All user-facing CLI surfaces must use **Playground AI** branding.

- CLI display name: `Playground AI CLI`
- Primary command: `playground`
- Optional alias: `pgai`
- Shell prompt label: `Playground AI`
- Help header: `Playground AI CLI - Agentic coding runtime`
- Default model label in UI/help text: `Playground AI`
- Package naming:
  - Node: `@playground-ai/cli`
  - Python: `playground-ai-cli`
- Config namespace:
  - file: `.playgroundai/config.json`
  - env prefix: `PLAYGROUND_AI_`

Compatibility note:
- Backend/auth can still accept existing `X-API-Key`/legacy internal keys while we migrate naming.
- No user-facing `Codex` label in CLI output, help, or docs.

## 3) V1 Command Surface

- `playground chat`
  - interactive chat with streaming tokens and proof-of-life events
- `playground run "<task>"`
  - non-interactive single-shot execution
- `playground sessions list`
- `playground sessions show <id>`
- `playground replay <sessionId>`
- `playground execute --session <id> --action <actionId>`
- `playground index upsert --path <dir>`
- `playground index query "<question>"`
- `playground auth login` / `playground auth set-key`
- `playground usage`
- `playground checkout`

## 4) API Mapping

Playground runtime:
- `POST /api/v1/playground/sessions`
- `POST /api/v1/playground/assist` (streaming)
- `POST /api/v1/playground/execute`
- `GET /api/v1/playground/sessions`
- `GET /api/v1/playground/sessions/[id]/messages`
- `POST /api/v1/playground/replay`
- `POST /api/v1/playground/index/upsert`
- `POST /api/v1/playground/index/query`
- `POST /api/v1/playground/agents/run`

HF router:
- `POST /api/v1/hf/chat/completions` (supports `stream: true`)
- `GET /api/v1/hf/usage`

Billing/paywall:
- Add API-key-friendly checkout link endpoint for CLI:
  - `POST /api/v1/playground/checkout-link`

## 5) UX Requirements

- Enter sends by default in interactive mode.
- Multi-line is explicit (`Shift+Enter` or `--multiline`).
- Visible proof-of-life timeline:
  - `Thinking`
  - `Ran <tool/step>`
  - `Streaming response...`
- Resilient submit path:
  - keyboard send and button send both hit one hardened sender path.
- Streaming must be on by default for `chat`.

## 6) Packaging and Release

Node:
- Package with `bin` entry for `playground`.
- Optional single-file bundle for lightweight installs.

Python:
- Package with `console_scripts` entry point for `playground`.

Release channels:
- npm publish for Node
- PyPI publish for Python
- parity tests must pass before publish

## 7) Testing Matrix

- Unit:
  - command parsing
  - config loading
  - branding constants
- Integration:
  - auth + usage + checkout
  - assist stream parsing
  - execute action flow
- E2E:
  - first-run paywall trigger (after first successful run)
  - streaming + proof-of-life messages
  - Node/Python output parity snapshots

Branding acceptance tests:
- `playground --help` contains `Playground AI CLI`
- no `Codex` token in user-facing output
- prompts and status bars show `Playground AI`

## 8) Build Plan

Phase 1 (Foundation):
- create shared CLI contract package (types, events, error model)
- implement auth/config and command skeleton

Phase 2 (Core Runtime):
- implement `chat`, `run`, sessions, replay, execute
- wire stream parser with proof-of-life event rendering

Phase 3 (Index + HF):
- index upsert/query and hf usage commands
- add retries + structured error output

Phase 4 (Billing + Paywall):
- add checkout-link endpoint
- enforce first-run paywall server-side for CLI cohort

Phase 5 (Hardening):
- e2e tests, parity snapshots, packaging, release docs

## 9) Definition of Done

- CLI command set ships in Node + Python with parity.
- Branding is consistently **Playground AI** on all CLI surfaces.
- Streaming and proof-of-life are visible and reliable.
- Paywall/checkout flow works from API-key-only CLI context.
- Publish pipeline is automated and tested.
