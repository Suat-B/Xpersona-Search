# OpenHands Gateway

This local service exposes the contract Xpersona expects for hosted coding orchestration:

- `GET /health`
- `POST /v1/runs/start`
- `POST /v1/runs/:runId/continue`

It uses the official OpenHands SDK as the planning/orchestration layer while the IDE extension continues to execute tools locally.

## Local setup

### Recommended on Windows / Python < 3.12

The official OpenHands SDK currently requires Python 3.12+. If your system Python is older, use Docker:

```bash
npm run openhands:gateway:docker
```

That starts the gateway on `http://localhost:8010`.

### Direct local process

1. Install the Python dependency:

```bash
npm run openhands:gateway:setup
```

2. Start the gateway:

```bash
npm run openhands:gateway
```

3. Point Xpersona at it:

```env
OPENHANDS_GATEWAY_URL=http://localhost:8010
```

## Optional auth

If you want the gateway protected, set the same API key on the gateway process and in the Xpersona app env:

```env
OPENHANDS_GATEWAY_API_KEY=your_secret_here
```

## Hugging Face Router model ids

When `model.baseUrl` contains `huggingface.co`, the gateway calls **`/v1/chat/completions` directly** (no tools in the request). That matches the public router API and avoids LiteLLM/OpenHands injecting tool schemas that some models mis-handle (e.g. calling a fake tool named `summary`). The `model` field in the JSON body is the registry id (e.g. `openai/gpt-oss-120b:groq`).

For non–Hugging Face `baseUrl` values, the gateway still uses the OpenHands SDK + LiteLLM. Those hosts may still use the **double `openai/` prefix** logic in `resolve_openhands_model` when needed.

Optional: **`OPENHANDS_HF_MAX_TOKENS`** (default `4096`, max `8192`) caps completion size for the direct HF path.

### Groq-backed models (`:groq`) and HTTP 403

Models like `openai/gpt-oss-120b:groq` are served via **Groq** behind **Cloudflare**. You may see **403** with an HTML body mentioning `api.groq.com`, especially when the gateway runs in **Docker** (datacenter-like egress) or with a blocked **User-Agent**.

Mitigations:

1. Set **`HF_ROUTER_USER_AGENT`** in `.env.local` (loaded by the gateway container) to the same User-Agent string your desktop browser sends, **or** rely on the gateway’s default Chrome-like UA after rebuilding the image.
2. Run the gateway **on the host**: `npm run openhands:gateway` (no Docker) so traffic exits from your home/office IP.
3. Use a **non-Groq** HF Router model in Cutie (e.g. Qwen with a `:fastest` or non-`:groq` route) if Groq keeps blocking.

## Optional overrides

- `OPENHANDS_GATEWAY_PORT` default: `8010`
- `OPENHANDS_GATEWAY_HOST` default: `127.0.0.1`
- `OPENHANDS_GATEWAY_PYTHON` default: `python`
- `OPENHANDS_GATEWAY_WORKSPACE` default: current repo root
