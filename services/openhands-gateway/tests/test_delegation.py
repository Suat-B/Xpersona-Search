from __future__ import annotations

import io
import json
import sys
from unittest.mock import patch

import agent_turn


def test_resolve_delegation_config_defaults() -> None:
    config = agent_turn.resolve_delegation_config({})
    assert config["enabled"] is True
    assert config["mode"] == "auto"
    assert config["maxChildren"] == 3
    assert config["visibility"] == "summary_only"
    assert config["supportedAgentTypes"] == ["default"]


def test_resolve_delegation_block_reason_for_browser_lane() -> None:
    payload = {
        "delegation": {"enabled": True},
        "executionHints": {"policyLane": "browser"},
        "request": {"interactionKind": "browser_task", "task": "Open the site and click the login button"},
    }
    config = agent_turn.resolve_delegation_config(payload)
    assert agent_turn.resolve_delegation_block_reason(payload, config) == "blocked_browser_lane"


def test_apply_delegation_summary_to_result_merges_counts() -> None:
    result = {"ok": True, "final": "done"}
    summary = {
        "delegationUsed": True,
        "delegationReason": "Parallel repo analysis",
        "childCount": 2,
        "completedChildren": 1,
        "failedChildren": 1,
        "childSummaries": [{"childId": "analysis", "status": "completed"}],
    }
    merged = agent_turn.apply_delegation_summary_to_result(result, summary)
    assert merged["delegationUsed"] is True
    assert merged["delegationReason"] == "Parallel repo analysis"
    assert merged["childCount"] == 2
    assert merged["completedChildren"] == 1
    assert merged["failedChildren"] == 1
    assert merged["childSummaries"] == [{"childId": "analysis", "status": "completed"}]


def test_main_stream_jsonl_emits_event_and_result() -> None:
    payload = {"protocol": "xpersona_openhands_gateway_v1"}
    stdout = io.StringIO()
    stdin = io.StringIO(json.dumps(payload))

    def fake_run_turn(raw_payload, event_callback=None):
        assert raw_payload == payload
        assert callable(event_callback)
        event_callback({"event": "delegation.started", "data": {"delegationUsed": True}})
        return {"ok": True, "final": "delegated"}

    with patch.object(agent_turn, "run_turn", side_effect=fake_run_turn):
        with patch.object(sys, "argv", ["agent_turn.py", "--stream-jsonl"]):
            with patch.object(sys, "stdin", stdin):
                with patch.object(sys, "stdout", stdout):
                    exit_code = agent_turn.main()

    lines = [json.loads(line) for line in stdout.getvalue().splitlines() if line.strip()]
    assert exit_code == 0
    assert lines[0] == {
        "type": "event",
        "event": {"event": "delegation.started", "data": {"delegationUsed": True}},
    }
    assert lines[1] == {
        "type": "result",
        "result": {"ok": True, "final": "delegated"},
    }
