# Binary IDE CLI

Official terminal interface for **Binary IDE**.

## Install (local development)

```bash
npm --prefix sdk/playground-ai-cli install
npm --prefix sdk/playground-ai-cli run build
node sdk/playground-ai-cli/dist/cli.js --help
```

## Commands

```bash
binary commands
binary debug-runtime "reproduce the hosted runtime issue"
binary login
binary whoami
binary logout
binary auth set-key
binary auth browser
binary chat
binary run "refactor this module"
binary sessions list
binary sessions show <session-id>
binary usage
binary checkout
binary index upsert --project my-repo --path .
binary index query --project my-repo "where is auth middleware?"
```

`binary commands` prints the full audited command map (including aliases).

`binary chat` and `binary run` execute hosted tool requests against your current working directory, so launch them from the workspace you want Binary IDE to inspect or modify.

By default the CLI now supports a local-host-aware transport model:

- `auto` tries Binary Host first, then falls back to direct hosted mode
- `host` requires the local Binary Host service
- `direct` talks to the hosted Binary IDE API without the local host layer

Configure it with:

```bash
binary config set-transport auto
binary config set-local-host-url http://127.0.0.1:7777
```

## Safe Runtime Debug

Use the hosted-runtime debug path when you want a reproducible trace without pointing the agent at your real repo:

```bash
binary debug-runtime "reproduce the runtime issue"
binary debug-runtime "why did the hosted run stall?" --mode debug
binary debug-runtime "same issue but use this temp folder" --workspace C:\\temp\\binary-debug
```

`generate` and `debug` are accepted by the CLI for local UX, and currently map to hosted `yolo` requests when talking to the Binary IDE API.

By default this command:

- creates an isolated temp workspace
- avoids `execute` / `index` flows
- captures stream events plus the final transcript
- writes a JSON debug bundle path at the end

If you intentionally want to debug from the current directory, pass `--unsafe-cwd`.

## Chat UX shortcuts

Inside `binary chat`, you can use:

- `/help` show in-chat commands
- `/mode <auto|plan|yolo|generate|debug>` switch mode live
- `/new` start a fresh session
- `/clear` clear terminal and redraw chat UI
- `/usage` show current usage
- `/checkout` open checkout URL
- `/exit` leave chat

## Config

Saved at:

```text
~/.binary-ide/config.json
```

Environment variables:

- `BINARY_IDE_API_KEY`
- `BINARY_IDE_BASE_URL`
- `BINARY_IDE_LOCAL_HOST_URL`
- `BINARY_IDE_TRANSPORT`

Browser auth:

- Run `binary auth browser` for one-shot sign-in via your browser.
- CLI stores refresh/access tokens in `~/.binary-ide/config.json`.
