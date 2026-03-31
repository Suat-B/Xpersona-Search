# Legacy Python CLI

Legacy Python runtime retained for internal compatibility only.

The public Binary IDE CLI now ships from the Node package under `sdk/playground-ai-cli`.

## Legacy Local Install

```bash
python -m pip install -e playground_ai/python_cli
python -m playground_ai_cli.cli --help
```

## Legacy Quick Start

```bash
python -m playground_ai_cli.cli auth set-key YOUR_API_KEY
python -m playground_ai_cli.cli chat
python -m playground_ai_cli.cli run "summarize this repository"
python -m playground_ai_cli.cli usage
python -m playground_ai_cli.cli checkout
```
