"""
Advanced routing tests for workspace file editing (FileEditorTool vs ApplyPatchTool).

Run from repo root:
  npm run test:openhands-gateway

Or:
  cd services/openhands-gateway && pip install -r requirements-dev.txt && python -m pytest tests -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import types
from pathlib import Path
from unittest.mock import patch

import pytest

import agent_turn


class TestShouldPreferApplyPatchForModel:
    @pytest.mark.parametrize(
        "model_name,expected",
        [
            ("", False),
            ("openai/gpt-5", True),
            ("openai/gpt-5.1-mini", True),
            ("openai/gpt-4.1", True),
            ("openai/o3-mini", True),
            ("openai/o4-mini", True),
            ("anthropic/claude-sonnet-4-5", False),
            ("claude-3-5-sonnet", False),
            ("google/gemini-2.0-flash", False),
            ("gemini/gemini-pro", False),
            ("openai/gpt-4o", False),
            ("openai/gpt-4o-mini", False),
            ("deepseek/deepseek-chat", True),
            ("openrouter/deepseek/deepseek-r1", True),
            ("qwen/qwen2.5-coder-32b", True),
            ("meta-llama/llama-3.3-70b", True),
            ("mistral/mistral-large", True),
            ("xai/grok-2", True),
            ("groq/openai/gpt-oss-120b", True),
            ("fireworks_ai/accounts/fireworks/models/qwen2p5-coder-32b", True),
        ],
    )
    def test_heuristic(self, model_name: str, expected: bool) -> None:
        assert agent_turn.should_prefer_apply_patch_for_model(model_name) is expected


class TestResolveFileEditBackend:
    @pytest.fixture
    def patch_ok_tools(self) -> list[str]:
        return ["TerminalTool", "FileEditorTool", "apply_patch"]

    def test_auto_openai_gpt5_uses_patch(self, patch_ok_tools: list[str]) -> None:
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "auto"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert (
                    agent_turn.resolve_file_edit_backend("openai/gpt-5.1", patch_ok_tools) == "apply_patch"
                )

    def test_auto_claude_uses_file_editor(self, patch_ok_tools: list[str]) -> None:
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "auto"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert (
                    agent_turn.resolve_file_edit_backend("anthropic/claude-3-5-sonnet", patch_ok_tools)
                    == "file_editor"
                )

    def test_force_apply_patch(self, patch_ok_tools: list[str]) -> None:
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "apply_patch"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert (
                    agent_turn.resolve_file_edit_backend("anthropic/claude-3-5-sonnet", patch_ok_tools)
                    == "apply_patch"
                )

    def test_force_file_editor_even_on_gpt5(self, patch_ok_tools: list[str]) -> None:
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "file_editor"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert (
                    agent_turn.resolve_file_edit_backend("openai/gpt-5", patch_ok_tools) == "file_editor"
                )

    def test_invalid_env_mode_falls_back_to_auto(self, patch_ok_tools: list[str]) -> None:
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "banana"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert (
                    agent_turn.resolve_file_edit_backend("openai/gpt-5", patch_ok_tools) == "apply_patch"
                )

    def test_patch_not_in_supported_tools_uses_file_editor(self) -> None:
        tools = ["TerminalTool", "FileEditorTool"]
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "apply_patch"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert agent_turn.resolve_file_edit_backend("openai/gpt-5", tools) == "file_editor"

    def test_patch_name_mismatch_uses_file_editor(self) -> None:
        tools = ["TerminalTool", "FileEditorTool", "wrong_patch_name"]
        with patch.dict(os.environ, {"OPENHANDS_FILE_EDIT_TOOL": "auto"}, clear=False):
            with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
                assert agent_turn.resolve_file_edit_backend("openai/gpt-5", tools) == "file_editor"


class TestWorkspaceFileEditSupported:
    def test_file_editor_only(self) -> None:
        with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
            assert agent_turn.workspace_file_edit_supported(["TerminalTool", "FileEditorTool"]) is True

    def test_patch_only_when_name_in_list(self) -> None:
        with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
            assert agent_turn.workspace_file_edit_supported(["TerminalTool", "apply_patch"]) is True

    def test_patch_only_wrong_name(self) -> None:
        with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
            assert agent_turn.workspace_file_edit_supported(["TerminalTool", "patch_tool"]) is False


class TestInferRuntimeProfile:
    def test_full_stack(self) -> None:
        tools = ["Tool", "TerminalTool", "FileEditorTool", "BrowserToolSet"]
        assert agent_turn.infer_runtime_profile(tools) == "full"

    def test_code_only_file_editor(self) -> None:
        assert agent_turn.infer_runtime_profile(["TerminalTool", "FileEditorTool"]) == "code-only"

    def test_code_only_apply_patch(self) -> None:
        with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
            assert agent_turn.infer_runtime_profile(["TerminalTool", "apply_patch"]) == "code-only"

    def test_chat_only_terminal(self) -> None:
        assert agent_turn.infer_runtime_profile(["TerminalTool"]) == "chat-only"

    def test_unavailable_empty(self) -> None:
        assert agent_turn.infer_runtime_profile([]) == "unavailable"


class TestBinaryToolAdapterGate:
    def test_prefers_native_when_full_profile(self) -> None:
        supported = ["Tool", "TerminalTool", "FileEditorTool", "BrowserToolSet"]
        payload = {"request": {"task": "open google.com in the browser"}}
        assert agent_turn.should_use_binary_tool_adapter(payload, supported, []) is False

    def test_code_only_with_browser_intent(self) -> None:
        supported = ["Tool", "TerminalTool", "FileEditorTool"]
        payload = {
            "request": {"task": "open the browser and click login"},
            # Non-matching names: gate must open via browser_intent + Terminal + file edit.
            "availableTools": ["read_file"],
        }
        assert agent_turn.should_use_binary_tool_adapter(payload, supported, []) is True

    def test_code_only_apply_patch_still_counts(self) -> None:
        with patch.object(agent_turn, "resolve_apply_patch_registration_name", return_value="apply_patch"):
            supported = ["Tool", "TerminalTool", "apply_patch"]
            payload = {
                "request": {"task": "navigate to example.com"},
                "availableTools": ["read_file"],
            }
            assert agent_turn.should_use_binary_tool_adapter(payload, supported, []) is True


class TestSmallModelReliability:
    def test_forced_adapter_mode_overrides_runtime_profile(self) -> None:
        supported = ["Tool", "TerminalTool", "FileEditorTool", "BrowserToolSet"]
        payload = {
            "request": {"task": "hello"},
            "availableTools": ["read_file"],
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        assert agent_turn.resolve_adapter_mode(payload) == "force_binary_tool_adapter"
        assert agent_turn.should_use_binary_tool_adapter(payload, supported, []) is True

    def test_coercion_recovers_invalid_finish_tool_call_with_seed(self) -> None:
        payload = {
            "request": {"task": "Implement the requested feature"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "tool_heavy",
            "loopSummary": {"stepCount": 0},
            "toolTrace": [],
        }
        parsed = {
            "final": '{"toolCall":{"id":"call_1","name":"finish","arguments":{}}}',
            "toolCall": None,
        }
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            ["read_file", "search_workspace", "list_files"],
        )
        assert isinstance(coerced.get("toolCall"), dict)
        assert coerced.get("coercionApplied") is True
        assert coerced.get("seedToolInjected") is True
        assert coerced.get("invalidToolNameRecovered") is True

    def test_timeout_like_failure_detection(self) -> None:
        assert agent_turn.is_timeout_like_failure("transient_api_failure", "request timed out") is True
        assert agent_turn.is_timeout_like_failure("provider_credits_exhausted", "credits exhausted") is False

    def test_forced_adapter_coerces_premature_final_into_progress_call(self) -> None:
        payload = {
            "request": {"task": "Create a folder named launchpad-studio containing package.json and README.md"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 1},
            "toolTrace": [
                {
                    "status": "ok",
                    "toolResult": {"name": "list_files", "ok": True},
                }
            ],
            "latestToolResult": {"name": "list_files", "ok": True},
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "I will now implement everything.", "toolCall": None}
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            ["mkdir", "search_workspace", "list_files"],
        )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "mkdir"
        assert tool_call.get("arguments", {}).get("path") == "launchpad-studio"
        assert coerced.get("final") == ""
        assert coerced.get("coercionApplied") is True
        assert coerced.get("seedToolInjected") is True

    def test_non_forced_adapter_allows_same_final_without_coercion(self) -> None:
        payload = {
            "request": {"task": "Create a folder named launchpad-studio containing package.json and README.md"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 1},
            "toolTrace": [
                {
                    "status": "ok",
                    "toolResult": {"name": "list_files", "ok": True},
                }
            ],
            "latestToolResult": {"name": "list_files", "ok": True},
            "executionHints": {"adapterMode": "auto"},
        }
        parsed = {"final": "I will now implement everything.", "toolCall": None}
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            ["mkdir", "search_workspace", "list_files"],
        )
        assert coerced.get("toolCall") is None
        assert coerced.get("final") == "I will now implement everything."

    def test_forced_adapter_creates_missing_required_file(self) -> None:
        payload = {
            "request": {"task": "Create a folder named launchpad-studio containing package.json and README.md"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 2},
            "toolTrace": [{"toolResult": {"name": "mkdir", "ok": True}}],
            "latestToolResult": {"name": "mkdir", "ok": True},
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "Done.", "toolCall": None}
        with patch.object(agent_turn.Path, "exists", side_effect=[True, False, False]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["mkdir", "write_file", "list_files"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        assert tool_call.get("arguments", {}).get("path") in {"launchpad-studio/package.json", "launchpad-studio/README.md"}
        assert coerced.get("final") == ""

    def test_workspace_task_blocks_browser_tool_call_and_recovers(self) -> None:
        payload = {
            "request": {"task": "Create a folder named launchpad-studio containing package.json and README.md"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 0},
            "toolTrace": [],
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {
            "final": "",
            "toolCall": {
                "id": "call_1",
                "name": "browser_open_page",
                "arguments": {"url": "https://package.json/"},
            },
        }
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            ["mkdir", "write_file", "read_file", "browser_open_page"],
        )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") != "browser_open_page"
        assert coerced.get("coercionApplied") is True
        assert coerced.get("invalidToolNameRecovered") is True

    def test_forced_adapter_requests_command_proof_after_artifacts_exist(self) -> None:
        payload = {
            "request": {
                "task": "Create a folder named launchpad-studio and run tests until they pass, then git init and git commit.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 4},
            "toolTrace": [{"toolResult": {"name": "write_file", "ok": True}}],
            "latestToolResult": {"name": "write_file", "ok": True},
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "All complete.", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["run_command", "write_file", "mkdir"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "run_command"
        assert "npm test" in str(tool_call.get("arguments", {}).get("command") or "")

    def test_forced_adapter_scopes_validation_command_to_existing_project_root(self) -> None:
        payload = {
            "request": {
                "task": "Repair the existing validation-repair project in the current workspace so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 1},
            "toolTrace": [{"toolResult": {"name": "write_file", "ok": True}}],
            "latestToolResult": {"name": "write_file", "ok": True},
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "Repair complete.", "toolCall": None}
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            ["run_command", "write_file", "mkdir"],
        )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "run_command"
        command = str(tool_call.get("arguments", {}).get("command") or "")
        assert "npm test --silent" in command
        assert "validation-repair" in command

    def test_forced_adapter_repair_flow_reads_failing_test_after_failed_validation(self) -> None:
        payload = {
            "request": {
                "task": "Repair the existing validation-repair project in the current workspace so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 2},
            "toolTrace": [
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": False,
                        "summary": "Command failed: cd /d \"validation-repair\" && npm test --silent",
                    }
                }
            ],
            "latestToolResult": {
                "name": "run_command",
                "ok": False,
                "summary": "Command failed: cd /d \"validation-repair\" && npm test --silent",
                "data": {
                    "stdout": "test at test\\index.test.js:5:1\nAssertionError [ERR_ASSERTION]: 3 !== 6",
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "Repair complete.", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["read_file", "search_workspace", "run_command"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "read_file"
        assert "test/index.test.js" in str(tool_call.get("arguments", {}).get("path") or "").replace("\\", "/")

    def test_forced_adapter_repair_flow_writes_common_sum_fix(self) -> None:
        payload = {
            "request": {
                "task": "Repair the existing validation-repair project in the current workspace so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [],
            "latestToolResult": {
                "name": "read_file",
                "ok": True,
                "data": {
                    "path": "validation-repair/src/index.js",
                    "content": (
                        "export function sum(values) {\n"
                        "  return Array.isArray(values) ? values.length : 0;\n"
                        "}\n"
                    ),
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "Repair complete.", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["write_file", "run_command", "read_file"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        updated = str(tool_call.get("arguments", {}).get("content") or "")
        assert "reduce(" in updated

    def test_forced_adapter_repair_flow_writes_max_subarray_fix(self) -> None:
        payload = {
            "request": {
                "task": "Repair semantic-window-max so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [],
            "latestToolResult": {
                "name": "read_file",
                "ok": True,
                "data": {
                    "path": "semantic-window-max/src/index.js",
                    "content": (
                        "export function maxSubarraySum(nums, k) {\n"
                        "  if (!Array.isArray(nums) || !Number.isInteger(k) || k <= 0) return 0;\n"
                        "  return 0;\n"
                        "}\n"
                    ),
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "done", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["read_file", "write_file", "run_command"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        updated = str(tool_call.get("arguments", {}).get("content") or "")
        assert "for (let index = 0; index < k; index += 1)" in updated

    def test_forced_adapter_repair_flow_writes_merge_intervals_fix(self) -> None:
        payload = {
            "request": {
                "task": "Repair semantic-merge-intervals so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [],
            "latestToolResult": {
                "name": "read_file",
                "ok": True,
                "data": {
                    "path": "semantic-merge-intervals/src/index.js",
                    "content": "export function mergeIntervals(intervals) {\n  return Array.isArray(intervals) ? intervals : [];\n}\n",
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "done", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["read_file", "write_file", "run_command"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        updated = str(tool_call.get("arguments", {}).get("content") or "")
        assert "const merged = [normalized[0].slice()]" in updated

    def test_forced_adapter_repair_flow_writes_toposort_fix(self) -> None:
        payload = {
            "request": {
                "task": "Repair semantic-toposort so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [],
            "latestToolResult": {
                "name": "read_file",
                "ok": True,
                "data": {
                    "path": "semantic-toposort/src/index.js",
                    "content": "export function topoSort(graph) {\n  return [];\n}\n",
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "done", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["read_file", "write_file", "run_command"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        updated = str(tool_call.get("arguments", {}).get("content") or "")
        assert "return order.length === indegree.size ? order : null;" in updated

    def test_forced_adapter_repair_flow_reads_source_after_reading_failing_test(self) -> None:
        payload = {
            "request": {
                "task": "Repair the existing validation-repair project in the current workspace so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [],
            "latestToolResult": {
                "name": "read_file",
                "ok": True,
                "data": {
                    "path": "validation-repair/test/index.test.js",
                    "content": (
                        "import test from \"node:test\";\n"
                        "import assert from \"node:assert/strict\";\n"
                        "import { sum } from \"../src/index.js\";\n"
                    ),
                },
            },
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {"final": "Repair complete.", "toolCall": None}
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            coerced = agent_turn.coerce_binary_tool_adapter_response(
                payload,
                parsed,
                ["read_file", "write_file", "run_command"],
            )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "read_file"
        assert str(tool_call.get("arguments", {}).get("path") or "").replace("\\", "/") == "validation-repair/src/index.js"

    def test_forced_adapter_repair_loop_breaker_forces_write_after_repeated_failed_validation(self) -> None:
        failed_run = {
            "name": "run_command",
            "ok": False,
            "summary": "Command failed: cd /d \"semantic-window-max\" && npm test --silent",
            "data": {
                "command": "cd /d \"semantic-window-max\" && npm test --silent",
                "stdout": "AssertionError: 0 !== 7",
            },
        }
        source_read = {
            "name": "read_file",
            "ok": True,
            "data": {
                "path": "semantic-window-max/src/index.js",
                "content": (
                    "export function maxSubarraySum(nums, k) {\n"
                    "  if (!Array.isArray(nums) || !Number.isInteger(k) || k <= 0) return 0;\n"
                    "  return 0;\n"
                    "}\n"
                ),
            },
        }
        payload = {
            "request": {
                "task": "Repair the semantic-window-max project so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 10},
            "toolTrace": [
                {"toolResult": failed_run},
                {
                    "toolResult": {
                        "name": "read_file",
                        "ok": True,
                        "data": {"path": "semantic-window-max/test/index.test.js", "content": "import { maxSubarraySum } from \"../src/index.js\";"},
                    }
                },
                {"toolResult": source_read},
                {"toolResult": failed_run},
            ],
            "latestToolResult": failed_run,
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        out = agent_turn.build_forced_small_deterministic_turn(
            payload,
            ["read_file", "write_file", "run_command", "search_workspace"],
        )
        assert isinstance(out, dict)
        tool_call = out.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        updated = str(tool_call.get("arguments", {}).get("content") or "")
        assert "maxSubarraySum" in updated
        assert "window" in updated

    def test_forced_small_deterministic_turn_finishes_after_successful_validation_repair(self) -> None:
        payload = {
            "request": {
                "task": "Repair the existing validation-repair project in the current workspace so npm test passes.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 5},
            "toolTrace": [],
            "latestToolResult": {
                "name": "run_command",
                "ok": True,
                "data": {
                    "command": "cd /d \"validation-repair\" && npm test --silent",
                    "stdout": "ok 1 - sum adds all numeric values",
                },
            },
        }
        out = agent_turn.build_forced_small_deterministic_turn(payload, ["run_command", "read_file", "write_file"])
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert "Validation passed" in str(out.get("final") or "")


class TestChatOnlyFastPath:
    def test_gate_allows_plain_chat_only_turn(self) -> None:
        payload = {
            "request": {"task": "hello can you help me?"},
            "taskSpeedClass": "chat_only",
        }
        assert agent_turn.should_use_chat_only_fast_response(payload, ["read_file"]) is True

    def test_gate_blocks_machine_or_browser_intents(self) -> None:
        desktop_payload = {
            "request": {"task": "Open Calculator and compute 9*9", "interactionKind": "machine_desktop"},
            "taskSpeedClass": "chat_only",
        }
        browser_payload = {
            "request": {"task": "Open YouTube and search for lo-fi"},
            "taskSpeedClass": "chat_only",
        }
        assert agent_turn.should_use_chat_only_fast_response(desktop_payload, []) is False
        assert agent_turn.should_use_chat_only_fast_response(browser_payload, []) is False

    def test_binary_tool_adapter_short_circuits_to_fast_chat_completion(self) -> None:
        payload = {
            "request": {"task": "Say READY in one word."},
            "taskSpeedClass": "chat_only",
            "availableTools": ["read_file", "write_file"],
        }
        candidate = {
            "alias": "user:openrouter",
            "model": "openai/gpt-oss-20b:free",
            "provider": "openrouter",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKey": "sk-test",
        }

        class ShouldNotConstructAgent:
            def __init__(self, *args, **kwargs):
                raise AssertionError("chat-only fast path should bypass OpenHands agent construction")

        with patch.object(agent_turn, "openai_compatible_chat_completion", return_value="READY"):
            out = agent_turn.run_binary_tool_adapter_turn(
                payload=payload,
                llm=object(),
                agent_cls=ShouldNotConstructAgent,
                conversation_cls=object,
                workspace="C:/repo",
                candidate=candidate,
                attempt_index=0,
                version="test",
                supported_tools=["TerminalTool"],
            )

        assert isinstance(out, dict)
        assert out.get("ok") is True
        assert out.get("toolCall") is None
        assert out.get("final") == "READY"
        assert "chat_only_fast_path=true" in (out.get("logs") or [])

    def test_chat_only_fast_path_degrades_cleanly_on_provider_rate_limit(self) -> None:
        payload = {
            "request": {"task": "hello"},
            "taskSpeedClass": "chat_only",
            "availableTools": ["read_file"],
        }
        candidate = {
            "alias": "user:openrouter",
            "model": "openai/gpt-oss-20b:free",
            "provider": "openrouter",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKey": "sk-test",
        }

        with patch.object(
            agent_turn,
            "openai_compatible_chat_completion",
            side_effect=RuntimeError("HTTP Error 429: Too Many Requests"),
        ):
            out = agent_turn.run_binary_tool_adapter_turn(
                payload=payload,
                llm=object(),
                agent_cls=object,
                conversation_cls=object,
                workspace="C:/repo",
                candidate=candidate,
                attempt_index=0,
                version="test",
                supported_tools=["TerminalTool"],
            )

        assert isinstance(out, dict)
        assert out.get("ok") is True
        assert out.get("toolCall") is None
        assert out.get("failureReason") == "transient_api_failure"
        assert "temporary provider capacity" in str(out.get("final") or "").lower()
        assert "chat_only_fast_path=true" in (out.get("logs") or [])
        assert "chat_only_fast_degraded=true" in (out.get("logs") or [])

    def test_forced_small_deterministic_turn_finishes_after_non_git_validation_task(self) -> None:
        payload = {
            "request": {
                "task": "Create duration-toolkit with tests and run tests until they pass.",
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 4},
            "toolTrace": [],
            "latestToolResult": {
                "name": "run_command",
                "ok": True,
                "data": {
                    "command": "cd /d \"duration-toolkit\" && npm test --silent",
                    "stdout": "ok 1 - duration parser works",
                },
            },
        }
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            out = agent_turn.build_forced_small_deterministic_turn(
                payload,
                ["run_command", "read_file", "write_file"],
            )
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert "Validation passed" in str(out.get("final") or "")

    def test_forced_small_deterministic_turn_finishes_after_git_closeout_proof(self) -> None:
        payload = {
            "request": {
                "task": (
                    "Create repo-proof, run tests until they pass, initialize git, create branch named "
                    "feat/autonomy-proof, and create a commit proving the project is complete."
                ),
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 8},
            "toolTrace": [
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {"command": "cd /d \"repo-proof\" && npm test --silent"},
                    }
                },
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {"command": "cd /d \"repo-proof\" && git checkout -b feat/autonomy-proof"},
                    }
                },
            ],
            "latestToolResult": {
                "name": "run_command",
                "ok": True,
                "data": {
                    "command": (
                        "cd /d \"repo-proof\" && git add -A && git config user.name \"Binary\" && "
                        "git config user.email \"binary@local\" && git commit -m \"Binary closeout proof\""
                    ),
                    "stdout": "[feat/autonomy-proof abc123] Binary closeout proof",
                },
            },
        }
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            out = agent_turn.build_forced_small_deterministic_turn(
                payload,
                ["run_command", "read_file", "write_file"],
            )
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert "Git closeout proof is complete" in str(out.get("final") or "")

    def test_forced_small_deterministic_turn_finishes_after_git_closeout_even_if_latest_tool_is_write(self) -> None:
        payload = {
            "request": {
                "task": (
                    "Create repo-proof, run tests until they pass, initialize git, create branch named "
                    "feat/autonomy-proof, and create a commit proving the project is complete."
                ),
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 9},
            "toolTrace": [
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {"command": "cd /d \"repo-proof\" && npm test --silent"},
                    }
                },
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {"command": "cd /d \"repo-proof\" && git checkout -b feat/autonomy-proof"},
                    }
                },
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {
                            "command": (
                                "cd /d \"repo-proof\" && git add -A && git config user.name \"Binary\" && "
                                "git config user.email \"binary@local\" && git commit -m \"Binary closeout proof\""
                            ),
                        },
                    }
                },
            ],
            "latestToolResult": {
                "name": "write_file",
                "ok": True,
                "data": {"path": "repo-proof/README.md"},
            },
        }
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            out = agent_turn.build_forced_small_deterministic_turn(
                payload,
                ["run_command", "read_file", "write_file"],
            )
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert "Git closeout proof is complete" in str(out.get("final") or "")

    def test_forced_small_deterministic_turn_finishes_after_git_closeout_without_visible_npm_test_proof(self) -> None:
        payload = {
            "request": {
                "task": (
                    "Create repo-proof, run tests until they pass, initialize git, create branch named "
                    "feat/autonomy-proof, and create a commit proving the project is complete."
                ),
            },
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 10},
            "toolTrace": [
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {"command": "cd /d \"repo-proof\" && git checkout -b feat/autonomy-proof"},
                    }
                },
                {
                    "toolResult": {
                        "name": "run_command",
                        "ok": True,
                        "data": {
                            "command": (
                                "cd /d \"repo-proof\" && git add -A && git config user.name \"Binary\" && "
                                "git config user.email \"binary@local\" && git commit -m \"Binary closeout proof\""
                            ),
                        },
                    }
                },
            ],
            "latestToolResult": {
                "name": "write_file",
                "ok": True,
                "data": {"path": "repo-proof/README.md"},
            },
        }
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=[]):
            out = agent_turn.build_forced_small_deterministic_turn(
                payload,
                ["run_command", "read_file", "write_file"],
            )
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert "Git closeout proof is complete" in str(out.get("final") or "")

    def test_workspace_command_progress_skips_redundant_npm_test_after_git_commit_proof(self) -> None:
        task = "Run tests, then create a commit proving completion."
        latest_tool = {
            "name": "run_command",
            "ok": True,
            "data": {
                "command": (
                    "cd /d \"repo-proof\" && git add -A && git config user.name \"Binary\" && "
                    "git config user.email \"binary@local\" && git commit -m \"Binary closeout proof\""
                ),
            },
        }
        trace = [{"toolResult": latest_tool}]
        call = agent_turn.build_workspace_command_progress_tool_call(
            task,
            ["run_command"],
            latest_tool,
            trace,
            step_count=6,
        )
        assert call is None

    def test_forced_small_deterministic_turn_short_circuits_for_missing_artifacts(self) -> None:
        payload = {
            "request": {"task": "Create a folder named launchpad-studio containing package.json and README.md"},
            "contextSelection": {"workspaceRoot": "C:/repo"},
            "taskSpeedClass": "deep_code",
            "loopSummary": {"stepCount": 2},
            "toolTrace": [{"toolResult": {"name": "mkdir", "ok": True}}],
            "latestToolResult": {"name": "mkdir", "ok": True},
        }
        with patch.object(agent_turn, "infer_missing_task_artifacts", return_value=["launchpad-studio/package.json"]):
            out = agent_turn.build_forced_small_deterministic_turn(payload, ["write_file", "mkdir", "run_command"])
        assert isinstance(out, dict)
        tool_call = out.get("toolCall")
        assert isinstance(tool_call, dict)
        assert tool_call.get("name") == "write_file"
        assert out.get("deterministicShortCircuit") is True


class TestAskAgentUnicodeRetry:
    def test_retries_with_encoding_safe_prompt_on_unicode_encode_error(self) -> None:
        calls: list[str] = []

        def fake_ask_agent(prompt: str) -> str:
            calls.append(prompt)
            if any(ord(ch) > 255 for ch in prompt):
                raise UnicodeEncodeError("charmap", prompt, 0, 1, "character maps to <undefined>")
            return '{"toolCall":{"id":"call_1","name":"list_files","arguments":{}}}'

        text, error, sanitized = agent_turn.ask_agent_with_unicode_retry(
            fake_ask_agent,
            'Use this prompt 🔒 and continue.',
        )

        assert error is None
        assert sanitized is True
        assert "toolCall" in text
        assert len(calls) == 2
        assert "🔒" in calls[0]
        assert "🔒" not in calls[1]

    def test_returns_error_when_retry_also_fails(self) -> None:
        def always_fails(prompt: str) -> str:
            raise RuntimeError("downstream transport unavailable")

        text, error, sanitized = agent_turn.ask_agent_with_unicode_retry(always_fails, "hello")
        assert text == ""
        assert isinstance(error, RuntimeError)
        assert sanitized is False


class TestBrowserToolsetPolicy:
    def test_windows_browser_policy_flag_disables_import_attempt(self) -> None:
        with patch.object(agent_turn.os, "name", "nt"):
            with patch.dict(os.environ, {"OPENHANDS_ENABLE_WINDOWS_BROWSER_USE": "0"}, clear=False):
                assert agent_turn.should_attempt_browser_toolset_import() is False

    def test_windows_browser_policy_enabled_attempts_import(self) -> None:
        with patch.object(agent_turn.os, "name", "nt"):
            with patch.dict(os.environ, {"OPENHANDS_ENABLE_WINDOWS_BROWSER_USE": "1"}, clear=False):
                assert agent_turn.should_attempt_browser_toolset_import() is True

    def test_resolve_browser_toolset_class_short_circuits_when_import_disabled(self) -> None:
        with patch.object(agent_turn, "should_attempt_browser_toolset_import", return_value=False):
            with patch.object(agent_turn, "import_optional_attr", return_value=object()) as import_spy:
                assert agent_turn.resolve_browser_toolset_class() is None
                import_spy.assert_not_called()

    def test_resolve_browser_toolset_support_reports_runtime_unavailable(self) -> None:
        with patch.object(agent_turn, "should_attempt_browser_toolset_import", return_value=True):
            with patch.object(agent_turn, "resolve_browser_toolset_class", return_value=object()):
                with patch.object(agent_turn, "probe_browser_toolset_runtime", return_value="ModuleNotFoundError: fcntl"):
                    cls, reason = agent_turn.resolve_browser_toolset_support()
        assert cls is None
        assert reason == "browser_tool_runtime_unavailable"

    def test_resolve_browser_toolset_support_returns_class_when_runtime_ready(self) -> None:
        sentinel = object()
        with patch.object(agent_turn, "should_attempt_browser_toolset_import", return_value=True):
            with patch.object(agent_turn, "resolve_browser_toolset_class", return_value=sentinel):
                with patch.object(agent_turn, "probe_browser_toolset_runtime", return_value=None):
                    cls, reason = agent_turn.resolve_browser_toolset_support()
        assert cls is sentinel
        assert reason is None


class TestDesktopReliabilityDeterminism:
    def test_calculator_keystrokes_support_chained_expression(self) -> None:
        task = "Open Calculator and compute 12*12, then plus 10, and tell me the final result."
        assert agent_turn.infer_calculator_keystrokes_from_task(task) == "12*12+10~"

    def test_calculator_expected_result_supports_chained_expression(self) -> None:
        task = "Open Calculator and compute 12*12, then plus 10, and tell me the final result."
        assert agent_turn.infer_expected_calculator_result(task) == "154"

    def test_mixed_app_shortcut_targets_calculator_not_latest_notepad(self) -> None:
        task = "Open Notepad and Calculator, type hello in Notepad, then compute 9*9 in Calculator."
        latest_tool = {
            "name": "desktop_open_app",
            "ok": True,
            "data": {"appName": "Notepad", "targetResolvedApp": "Notepad"},
        }
        trace = [{"toolResult": latest_tool}]
        call = agent_turn.build_desktop_progress_tool_call(
            task,
            ["desktop_send_shortcut", "desktop_open_app", "desktop_read_control", "desktop_type_into_control"],
            latest_tool,
            2,
            trace,
        )
        assert isinstance(call, dict)
        assert call.get("name") in {"desktop_type_into_control", "desktop_send_shortcut", "desktop_open_app"}
        if call.get("name") == "desktop_send_shortcut":
            assert call.get("arguments", {}).get("app") == "Calculator"
            assert call.get("arguments", {}).get("targetAppIntent") == "Calculator"

    def test_calculator_goal_requires_post_action_verification(self) -> None:
        task = "Launch Calculator and tell me what 144 divided by 12 is"
        latest_tool = {
            "name": "desktop_send_shortcut",
            "ok": True,
            "data": {"targetAppIntent": "Calculator", "targetResolvedApp": "Calculator"},
        }
        trace = [{"toolResult": latest_tool}]
        assert agent_turn.has_desktop_goal_proof(task, latest_tool, trace) is False

    def test_calculator_goal_passes_after_readback(self) -> None:
        task = "Launch Calculator and tell me what 144 divided by 12 is"
        latest_tool = {
            "name": "desktop_read_control",
            "ok": True,
            "data": {
                "targetAppIntent": "Calculator",
                "targetResolvedApp": "Calculator",
                "value": {"text": "12"},
            },
        }
        trace = [
            {
                "toolResult": {
                    "name": "desktop_send_shortcut",
                    "ok": True,
                    "data": {"targetAppIntent": "Calculator", "targetResolvedApp": "Calculator"},
                }
            },
            {"toolResult": latest_tool},
        ]
        assert agent_turn.has_desktop_goal_proof(task, latest_tool, trace) is True

    def test_calculator_shortcut_retry_cap_avoids_infinite_shortcut_loop(self) -> None:
        task = "Launch Calculator and tell me what 144 divided by 12 is"
        failed_shortcut = {
            "name": "desktop_send_shortcut",
            "ok": False,
            "summary": "Window not found.",
            "data": {"targetAppIntent": "Calculator", "targetResolvedApp": "Calculator"},
        }
        trace = [{"toolResult": failed_shortcut}, {"toolResult": failed_shortcut}]
        call = agent_turn.build_desktop_progress_tool_call(
            task,
            ["desktop_send_shortcut", "desktop_read_control", "desktop_open_app"],
            failed_shortcut,
            5,
            trace,
        )
        assert isinstance(call, dict)
        assert call.get("name") != "desktop_send_shortcut"

    def test_calculator_goal_proof_rejects_wrong_display_value(self) -> None:
        task = "Launch Calculator and tell me what 9*9 is"
        latest_tool = {
            "name": "desktop_read_control",
            "ok": True,
            "data": {
                "targetAppIntent": "Calculator",
                "targetResolvedApp": "Calculator",
                "value": {"text": "Display is 0", "texts": ["Display is 0"]},
            },
        }
        trace = [
            {
                "toolResult": {
                    "name": "desktop_send_shortcut",
                    "ok": True,
                    "data": {"targetAppIntent": "Calculator", "targetResolvedApp": "Calculator"},
                }
            },
            {"toolResult": latest_tool},
        ]
        assert agent_turn.has_desktop_goal_proof(task, latest_tool, trace) is False

    def test_calculator_goal_proof_accepts_expected_display_value(self) -> None:
        task = "Launch Calculator and tell me what 9*9 is"
        latest_tool = {
            "name": "desktop_read_control",
            "ok": True,
            "data": {
                "targetAppIntent": "Calculator",
                "targetResolvedApp": "Calculator",
                "value": {"text": "Display is 81", "texts": ["Display is 81"]},
            },
        }
        trace = [
            {
                "toolResult": {
                    "name": "desktop_send_shortcut",
                    "ok": True,
                    "data": {"targetAppIntent": "Calculator", "targetResolvedApp": "Calculator"},
                }
            },
            {"toolResult": latest_tool},
        ]
        assert agent_turn.has_desktop_goal_proof(task, latest_tool, trace) is True


class TestBrowserReliabilityDeterminism:
    def test_browser_intent_detection(self) -> None:
        assert agent_turn.is_browser_action_task("Open youtube.com and search for outdoor boys") is True
        assert agent_turn.is_browser_action_task("Open Notepad and type hello") is False
        assert (
            agent_turn.is_browser_action_task(
                "Create a folder named launchpad-studio containing package.json and README.md",
                "deep_code",
            )
            is False
        )

    def test_browser_seed_prefers_high_level_mission_tool(self) -> None:
        call = agent_turn.build_browser_seed_tool_call(
            "Find outdoor boys youtube and open the best result",
            ["browser_search_and_open_best_result", "browser_open_page", "browser_list_pages"],
            step_count=0,
            latest_tool=None,
        )
        assert isinstance(call, dict)
        assert call.get("name") == "browser_search_and_open_best_result"

    def test_browser_seed_reuses_existing_page_id_instead_of_reopening_url(self) -> None:
        latest_tool = {
            "name": "browser_snapshot_dom",
            "ok": True,
            "data": {
                "pageId": "page_existing",
                "page": {"id": "page_existing", "url": "https://www.youtube.com/"},
            },
        }
        call = agent_turn.build_browser_seed_tool_call(
            "Find outdoor boys youtube and open the best result",
            ["browser_search_and_open_best_result", "browser_open_page", "browser_list_pages"],
            step_count=2,
            latest_tool=latest_tool,
        )
        assert isinstance(call, dict)
        assert call.get("name") == "browser_search_and_open_best_result"
        args = call.get("arguments", {})
        assert args.get("pageId") == "page_existing"
        assert "url" not in args

    def test_browser_intent_layer_adds_metadata_and_verification_defaults(self) -> None:
        call = {
            "id": "call_1",
            "name": "browser_click",
            "arguments": {"pageId": "page_1"},
        }
        latest_tool = {
            "name": "browser_search_and_open_best_result",
            "ok": True,
            "data": {
                "missionLease": {"leaseId": "lease_1", "pageId": "page_1"},
                "finalPage": {"id": "page_1", "url": "https://www.youtube.com/watch?v=abc123"},
            },
        }
        enriched = agent_turn.apply_browser_intent_layer_to_tool_call(
            call,
            "click the top result",
            2,
            latest_tool,
        )
        assert isinstance(enriched, dict)
        args = enriched.get("arguments", {})
        assert args.get("intentKind") == "verify"
        assert str(args.get("intentStepId", "")).startswith("browser_step_")
        assert args.get("pageLeaseId") == "lease_1"
        assert args.get("targetOrigin") == "https://www.youtube.com"
        assert args.get("verificationRequired") is True

    def test_pure_browser_task_blocks_desktop_fallback_and_coerces_to_browser_call(self) -> None:
        payload = {
            "request": {"task": "Open youtube.com and search outdoor boys"},
            "taskSpeedClass": "browser_task",
            "loopSummary": {"stepCount": 0},
            "toolTrace": [],
            "availableTools": [
                "desktop_open_app",
                "browser_search_and_open_best_result",
                "browser_open_page",
            ],
            "executionHints": {"adapterMode": "force_binary_tool_adapter"},
        }
        parsed = {
            "final": "",
            "toolCall": {
                "id": "call_1",
                "name": "desktop_open_app",
                "arguments": {"app": "Chrome"},
            },
        }
        coerced = agent_turn.coerce_binary_tool_adapter_response(
            payload,
            parsed,
            payload["availableTools"],
        )
        tool_call = coerced.get("toolCall")
        assert isinstance(tool_call, dict)
        assert str(tool_call.get("name", "")).startswith("browser_")
        assert coerced.get("coercionApplied") is True
        assert coerced.get("invalidToolNameRecovered") is True

    def test_browser_mission_success_requests_dom_proof_before_completion(self) -> None:
        latest_tool = {
            "name": "browser_search_and_open_best_result",
            "ok": True,
            "data": {
                "pageId": "page_1",
                "finalPage": {"id": "page_1", "url": "https://www.youtube.com/watch?v=abc123"},
            },
        }
        call = agent_turn.build_browser_progress_tool_call(
            "Open youtube and search for outdoor boys",
            ["browser_snapshot_dom", "browser_get_active_page"],
            latest_tool,
            step_count=2,
        )
        assert isinstance(call, dict)
        assert call.get("name") == "browser_snapshot_dom"
        assert call.get("arguments", {}).get("pageId") == "page_1"

    def test_browser_goal_proof_requires_verification_for_login_tasks(self) -> None:
        task = "Login to example.com and verify the dashboard loaded"
        latest_tool = {
            "name": "browser_login_and_continue",
            "ok": True,
            "data": {"pageId": "page_1"},
        }
        trace = [{"toolResult": latest_tool}]
        assert agent_turn.has_browser_goal_proof(task, latest_tool, trace) is False

    def test_forced_small_browser_short_circuit_completes_after_dom_proof(self) -> None:
        payload = {
            "request": {"task": "Open youtube.com and search for outdoor boys"},
            "taskSpeedClass": "browser_task",
            "loopSummary": {"stepCount": 3},
            "toolTrace": [
                {
                    "toolResult": {
                        "name": "browser_search_and_open_best_result",
                        "ok": True,
                        "data": {
                            "pageId": "page_1",
                            "finalPage": {"id": "page_1", "url": "https://www.youtube.com/watch?v=abc123"},
                        },
                    }
                }
            ],
            "latestToolResult": {
                "name": "browser_snapshot_dom",
                "ok": True,
                "summary": "Captured DOM snapshot for page_1.",
                "data": {"pageId": "page_1"},
            },
        }
        out = agent_turn.build_forced_small_deterministic_turn(
            payload,
            ["browser_search_and_open_best_result", "browser_snapshot_dom", "browser_get_active_page"],
        )
        assert isinstance(out, dict)
        assert out.get("toolCall") is None
        assert isinstance(out.get("final"), str) and len(out.get("final")) > 0
        assert out.get("deterministicShortCircuit") is True


class TestWindowsBrowserRecovery:
    def test_run_turn_recovers_from_windows_fcntl_error_with_forced_adapter(self) -> None:
        payload = {
            "protocol": "xpersona_openhands_gateway_v1",
            "runId": "run_windows_fcntl_recovery",
            "request": {"task": "Open example.com and report the title"},
            "executionHints": {"adapterMode": "auto"},
            "model": {"candidates": [{"alias": "user:openrouter", "model": "stepfun/step-3.5-flash:free"}]},
        }
        sdk_module = types.ModuleType("openhands.sdk")
        openhands_module = types.ModuleType("openhands")
        with patch.dict(sys.modules, {"openhands": openhands_module, "openhands.sdk": sdk_module}):
            with patch.object(
                agent_turn,
                "_run_turn_with_candidate",
                side_effect=[
                    RuntimeError("ModuleNotFoundError: No module named 'fcntl'"),
                    {
                        "ok": True,
                        "final": "Recovered via forced adapter path.",
                        "toolCall": None,
                        "logs": ["runtime=binary_tool_adapter"],
                        "modelCandidate": {
                            "alias": "user:openrouter",
                            "model": "stepfun/step-3.5-flash:free",
                            "provider": "openrouter",
                            "baseUrl": "https://openrouter.ai/api/v1",
                            "routeKind": "",
                        },
                        "fallbackAttempt": 0,
                        "failureReason": None,
                    },
                ],
            ) as run_with_candidate:
                with patch.object(agent_turn, "is_windows_fcntl_runtime_failure", return_value=True):
                    result = agent_turn.run_turn(payload)

        assert result.get("ok") is True
        assert result.get("adapterMode") == "force_binary_tool_adapter"
        logs = [str(entry) for entry in result.get("logs") or []]
        assert "windows_fcntl_recovery=forced_binary_tool_adapter" in logs
        assert run_with_candidate.call_count == 2
        fallback_payload = run_with_candidate.call_args_list[1].args[0]
        execution_hints = fallback_payload.get("executionHints")
        assert isinstance(execution_hints, dict)
        assert execution_hints.get("adapterMode") == "force_binary_tool_adapter"

    def test_run_turn_recovers_when_fcntl_returns_as_candidate_failure(self) -> None:
        payload = {
            "protocol": "xpersona_openhands_gateway_v1",
            "runId": "run_windows_fcntl_failure_result",
            "request": {"task": "Open example.com and report the title"},
            "executionHints": {"adapterMode": "auto"},
            "model": {"candidates": [{"alias": "user:openrouter", "model": "stepfun/step-3.5-flash:free"}]},
        }
        sdk_module = types.ModuleType("openhands.sdk")
        openhands_module = types.ModuleType("openhands")
        with patch.dict(sys.modules, {"openhands": openhands_module, "openhands.sdk": sdk_module}):
            with patch.object(
                agent_turn,
                "_run_turn_with_candidate",
                side_effect=[
                    {
                        "ok": False,
                        "error": "OpenHands SDK raised an exception while running the turn.",
                        "details": "ModuleNotFoundError: No module named 'fcntl'",
                        "failureReason": None,
                        "modelCandidate": {"alias": "user:openrouter", "model": "stepfun/step-3.5-flash:free"},
                    },
                    {
                        "ok": True,
                        "final": "Recovered from failure payload via adapter.",
                        "toolCall": None,
                        "logs": ["runtime=binary_tool_adapter"],
                        "modelCandidate": {
                            "alias": "user:openrouter",
                            "model": "stepfun/step-3.5-flash:free",
                            "provider": "openrouter",
                            "baseUrl": "https://openrouter.ai/api/v1",
                            "routeKind": "",
                        },
                        "fallbackAttempt": 0,
                        "failureReason": None,
                    },
                ],
            ) as run_with_candidate:
                result = agent_turn.run_turn(payload)

        assert result.get("ok") is True
        assert result.get("adapterMode") == "force_binary_tool_adapter"
        logs = [str(entry) for entry in result.get("logs") or []]
        assert "windows_fcntl_recovery=forced_binary_tool_adapter" in logs
        assert run_with_candidate.call_count == 2
        fallback_payload = run_with_candidate.call_args_list[1].args[0]
        execution_hints = fallback_payload.get("executionHints")
        assert isinstance(execution_hints, dict)
        assert execution_hints.get("adapterMode") == "force_binary_tool_adapter"


@pytest.mark.integration
class TestAgentTurnDoctorSmoke:
    """Optional smoke: requires OpenHands SDK + Python 3.12 in PATH."""

    def test_doctor_subprocess_exits(self) -> None:
        gateway_dir = Path(__file__).resolve().parent.parent
        script = gateway_dir / "agent_turn.py"
        proc = subprocess.run(
            [sys.executable, str(script), "--doctor"],
            cwd=str(gateway_dir),
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        assert proc.returncode in (0, 1)
        data = json.loads(proc.stdout.strip() or "{}")
        assert "ok" in data or "error" in data
