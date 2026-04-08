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
