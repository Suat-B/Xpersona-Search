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

## Optional overrides

- `OPENHANDS_GATEWAY_PORT` default: `8010`
- `OPENHANDS_GATEWAY_HOST` default: `127.0.0.1`
- `OPENHANDS_GATEWAY_PYTHON` default: `python`
- `OPENHANDS_GATEWAY_WORKSPACE` default: current repo root
