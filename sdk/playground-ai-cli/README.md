# Playground AI CLI

Official terminal interface for **Playground AI**.

## Install (local development)

```bash
npm --prefix sdk/playground-ai-cli install
npm --prefix sdk/playground-ai-cli run build
node sdk/playground-ai-cli/dist/cli.js --help
```

## Commands

```bash
playground auth set-key
playground chat
playground run "refactor this module"
playground sessions list
playground sessions show <session-id>
playground usage
playground checkout
playground index upsert --project my-repo --path .
playground index query --project my-repo "where is auth middleware?"
```

## Config

Saved at:

```text
~/.playgroundai/config.json
```

Environment variables:

- `PLAYGROUND_AI_API_KEY`
- `PLAYGROUND_AI_BASE_URL`
