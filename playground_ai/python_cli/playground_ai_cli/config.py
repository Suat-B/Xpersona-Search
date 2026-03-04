from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

DEFAULT_CONFIG: Dict[str, Any] = {
    "baseUrl": os.environ.get("PLAYGROUND_AI_BASE_URL", "http://localhost:3000"),
    "mode": "auto",
    "model": "Playground AI",
    "reasoning": "medium",
    "includeIdeContext": True,
}


def config_path() -> Path:
    return Path.home() / ".playgroundai" / "config.json"


def load_config() -> Dict[str, Any]:
    cfg_path = config_path()
    if not cfg_path.exists():
        return dict(DEFAULT_CONFIG)
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception:
        return dict(DEFAULT_CONFIG)
    merged = dict(DEFAULT_CONFIG)
    if isinstance(data, dict):
        merged.update(data)
    merged["baseUrl"] = str(merged.get("baseUrl", DEFAULT_CONFIG["baseUrl"])).rstrip("/")
    return merged


def save_config(config: Dict[str, Any]) -> None:
    cfg_path = config_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    merged = dict(DEFAULT_CONFIG)
    merged.update(config)
    merged["baseUrl"] = str(merged.get("baseUrl", DEFAULT_CONFIG["baseUrl"])).rstrip("/")
    cfg_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")


def get_api_key(config: Dict[str, Any]) -> str | None:
    return (
        os.environ.get("PLAYGROUND_AI_API_KEY")
        or os.environ.get("XPERSONA_API_KEY")
        or config.get("apiKey")
    )
