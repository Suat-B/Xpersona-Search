# Binary v1 Hosted Delegation Handoff

This document defines the hosted-service changes needed to activate Binary's new delegation-aware transport and desktop UI.

Binary-side support is already implemented in:

- `services/binary-host/src/hosted-transport.ts`
- `services/binary-host/src/server.ts`
- `services/binary-host/src/agent-job-manager.ts`
- `apps/binary-ide-desktop/renderer/app.js`

The remaining work belongs to the hosted service behind `POST /api/v1/playground/assist`.

## Source Alignment

This handoff follows the official OpenHands SDK guides:

- Sub-Agent Delegation: <https://docs.openhands.dev/sdk/guides/agent-delegation>
- Observability & Tracing: <https://docs.openhands.dev/sdk/guides/observability>

Relevant points from the docs:

- Register `DelegateTool`, then add it to the parent agent's tool list.
- Delegation works in two steps: `spawn` child agents, then `delegate` tasks to them.
- The tool can be capped with `max_children`.
- SDK tracing is already hierarchical around conversation and agent execution.

## Binary Contract

Binary now sends this request block on hosted runs by default:

```json
{
  "delegation": {
    "enabled": true,
    "mode": "auto",
    "maxChildren": 3,
    "visibility": "summary_only",
    "supportedAgentTypes": ["default"]
  }
}
```

Interpretation:

- `enabled`: Hosted service may use delegation.
- `mode: "auto"`: Service decides when a task is parallelizable.
- `maxChildren: 3`: Hard cap for concurrent child agents in v1.
- `visibility: "summary_only"`: Do not stream child transcripts to Binary.
- `supportedAgentTypes: ["default"]`: Use only the default sub-agent type in v1.

If delegation is unsupported, the hosted service should ignore the block and continue on the single-agent path.

## Required Response Fields

The hosted service should add these summary fields to `meta` and/or `final` envelopes when delegation is used:

```json
{
  "delegationUsed": true,
  "delegationReason": "Parallel repo exploration and test verification",
  "childCount": 2,
  "completedChildren": 2,
  "failedChildren": 0,
  "childSummaries": [
    {
      "childId": "repo_scan",
      "status": "completed",
      "summary": "Mapped the renderer event flow and identified delegation hooks.",
      "agentType": "default",
      "traceId": "trace-child-1",
      "completedAt": "2026-04-12T18:00:00.000Z"
    }
  ]
}
```

Notes:

- `childId` must be stable across all delegation events for the same child.
- `summary_only` means every child summary should stay short and parent-safe.
- `failedChildren` should include hard failures and cancelled children.

## Required SSE Events

Binary already listens for these events:

- `delegation.started`
- `delegation.child_status`
- `delegation.completed`

The hosted service should emit them on the existing SSE stream.

### `delegation.started`

Emit once when the parent decides to delegate.

```json
{
  "event": "delegation.started",
  "data": {
    "delegationUsed": true,
    "delegationReason": "Independent repo analysis and verification subtasks",
    "childCount": 2,
    "childSummaries": [
      {
        "childId": "analysis",
        "status": "running",
        "summary": "Scanning the workspace for the relevant modules.",
        "agentType": "default",
        "traceId": "trace-child-analysis"
      },
      {
        "childId": "tests",
        "status": "running",
        "summary": "Preparing validation coverage for the planned changes.",
        "agentType": "default",
        "traceId": "trace-child-tests"
      }
    ]
  }
}
```

### `delegation.child_status`

Emit when a child meaningfully changes state.

```json
{
  "event": "delegation.child_status",
  "data": {
    "childId": "analysis",
    "status": "completed",
    "summary": "Found the renderer state merge points and transport entry path.",
    "agentType": "default",
    "traceId": "trace-child-analysis",
    "completedAt": "2026-04-12T18:00:02.000Z"
  }
}
```

### `delegation.completed`

Emit once after all children settle and the parent is about to merge results.

```json
{
  "event": "delegation.completed",
  "data": {
    "delegationUsed": true,
    "delegationReason": "Independent repo analysis and verification subtasks",
    "childCount": 2,
    "completedChildren": 2,
    "failedChildren": 0,
    "childSummaries": [
      {
        "childId": "analysis",
        "status": "completed",
        "summary": "Found the renderer state merge points and transport entry path.",
        "agentType": "default",
        "traceId": "trace-child-analysis",
        "completedAt": "2026-04-12T18:00:02.000Z"
      },
      {
        "childId": "tests",
        "status": "completed",
        "summary": "Prepared the verification checklist for the host transport changes.",
        "agentType": "default",
        "traceId": "trace-child-tests",
        "completedAt": "2026-04-12T18:00:03.000Z"
      }
    ]
  }
}
```

## Hosted Service SDK Wiring

Below is the minimum OpenHands-side patch shape for the hosted service.

### 1. Register the tool

```python
from openhands.sdk.tool import register_tool
from openhands.tools.delegate import DelegateTool

register_tool("DelegateTool", DelegateTool)
```

If you need to enforce the Binary v1 limit in-tool, wrap it:

```python
from openhands.tools.delegate import DelegateTool

class BinaryDelegateTool(DelegateTool):
    @classmethod
    def create(cls, conv_state, max_children: int = 3):
        return super().create(conv_state, max_children=max_children)

register_tool("DelegateTool", BinaryDelegateTool)
```

### 2. Add the tool to the parent agent

```python
from openhands.sdk import Agent, Tool
from openhands.tools.preset.default import get_default_tools

tools = get_default_tools(enable_browser=True)
tools.append(Tool(name="DelegateTool"))

agent = Agent(llm=llm, tools=tools)
```

### 3. Gate delegation with Binary request policy

Use delegation only when all are true:

- request `delegation.enabled` is `true`
- request `delegation.mode` is `"auto"`
- task contains independent subtasks
- the operation is safe to parallelize

Do not delegate:

- browser-use flows
- native desktop control
- takeover-sensitive visible steps
- tasks that depend on shared mutable state ordering

Good v1 candidates:

- repo exploration
- parallel analysis
- independent fix/test subtasks
- multi-file investigation

### 4. Spawn default child agents only

Binary v1 assumes:

- only the default sub-agent type is used
- child agents stay hidden from the desktop UI
- the parent remains the only visible conversation

That means no custom child personas and no built-in `explore` / `bash` sub-agent types yet, even though the SDK supports richer patterns.

## Parent-Agent Behavior

The parent agent prompt or middleware should steer the model toward this behavior:

1. Detect whether subtasks are independent.
2. If yes, spawn up to `maxChildren`.
3. Delegate concise child tasks.
4. Wait for all child results.
5. Merge them into a single parent answer.
6. Emit Binary summary events without exposing full child transcripts.

Recommended child task style:

- make each child own a single bounded objective
- avoid overlapping write scopes
- ask for compact, merge-ready summaries
- preserve child IDs across retries and summaries

## Trace Continuity

Binary already forwards `execution.traceId` on hosted requests.

Hosted service expectations:

- keep the Binary run trace ID associated with the parent run
- include child `traceId` values in `childSummaries` when available
- preserve conversation/session grouping in OTEL exports

Inference from the OpenHands tracing docs:

- the SDK already creates hierarchical spans around `conversation`, `conversation.run`, `agent.step`, `llm.completion`, and `tool.execute`
- child delegation work should either inherit that trace context or be linked back to the same conversation/session grouping

Binary does not require a specific OTEL library change here, but it does expect parent/child trace continuity to remain debuggable.

## Failure Handling

The hosted service should never fail the whole run only because one child failed unless the parent cannot recover.

Preferred behavior:

- child fails
- emit `delegation.child_status` with `status: "failed"`
- parent continues with remaining children
- parent merges partial results
- final envelope reports `failedChildren > 0`

## Compatibility Rules

The service should remain backward compatible:

- no delegation block: behave exactly as before
- delegation block present but unsupported: ignore it
- delegation enabled but no parallel opportunity: no delegation events needed

## Acceptance Checklist

- `DelegateTool` is registered in the hosted service.
- Parent hosted agent includes `Tool(name="DelegateTool")`.
- Binary request `delegation` block is accepted without breaking older callers.
- Hosted SSE emits the three delegation event types above.
- Final envelope includes delegation summary fields when delegation is used.
- Child failures degrade gracefully into parent partial results.
- Trace IDs remain inspectable in the hosted observability backend.

## Suggested Validation Runs

1. Hosted coding task with two obvious independent subtasks.
2. Hosted coding task with no meaningful parallel split.
3. Hosted run where one child intentionally fails.
4. Hosted run with tracing enabled and child trace IDs present in summaries.

