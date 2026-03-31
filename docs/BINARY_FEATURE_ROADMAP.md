# Binary Feature Roadmap

## Purpose

This document turns the current Binary product wishlist into a concrete implementation roadmap that we can revisit later. It is organized by priority:

1. Must-have foundation
2. High-leverage product expansion
3. Future magic

Each item includes:

- User outcome
- Implementation shape
- Major subsystems
- Dependencies
- Risks
- Acceptance criteria

The goal is to keep Binary moving toward a true operating-system-grade AI copilot, not just a chat UI with tools.

---

## Phase 1: Must-Have Foundation

### 1. Unified Run Timeline

#### User outcome

Users can understand exactly what Binary did, why it did it, what it saw, what failed, and what still needs attention.

#### Implementation shape

- Build a shared run-event schema across web, desktop, CLI, and host.
- Normalize all execution into one event stream:
  - user message accepted
  - model selected
  - planning started
  - tool requested
  - tool executed
  - verification succeeded or failed
  - retry or replan
  - completed, blocked, failed, cancelled, takeover
- Add proof artifacts as first-class timeline items:
  - screenshots
  - window snapshots
  - shell output summaries
  - file diffs
  - validation results
- Make timeline events queryable by run, session, tool family, outcome, and time range.

#### Major subsystems

- `lib/playground/contracts.ts`
- `lib/playground/store.ts`
- `app/api/v1/playground/assist/*`
- `services/binary-host/src/server.ts`
- desktop renderer timeline UI
- web chat run metadata surfaces

#### Dependencies

- Stable event contract across hosted runs and local host runs
- Durable storage for event payloads and proof references
- UI virtualization for long timelines

#### Risks

- Event volume becomes too large for long autonomous runs
- Proof artifacts become expensive to store
- Different runtimes emit inconsistent event shapes

#### Acceptance criteria

- Every meaningful run step appears in order in one timeline
- Users can tell whether a result came from chat-only generation, tool orchestration, or local execution
- Long runs remain readable and performant
- Failed runs expose enough detail to debug without server logs

---

### 2. Trust, Permissions, And Safety Control Center

#### User outcome

Users always know what Binary is allowed to do and can change that instantly.

#### Implementation shape

- Replace scattered trust toggles with one permission model covering:
  - workspace read
  - workspace write
  - shell commands
  - network
  - browser control
  - desktop observation
  - desktop control
  - elevation
- Support scopes:
  - one run
  - one workspace
  - whole machine
- Add global kill switch plus per-run stop and pause.
- Add permission receipts to the timeline:
  - what scope was granted
  - when
  - by whom

#### Major subsystems

- Binary Host preferences and policy enforcement
- desktop control center UI
- run metadata and receipts
- tool policy gating in host and playground

#### Dependencies

- Unified permission vocabulary
- Host-side enforcement for every privileged tool

#### Risks

- Permissions become hard to understand if too granular
- Local host and web policy states drift apart

#### Acceptance criteria

- Users can inspect current permissions in one place
- Revoking a permission immediately affects future tool calls
- All blocked actions explain what permission is missing

---

### 3. Reliable Resume, Recovery, And Takeover

#### User outcome

Binary can survive disconnects, stalls, and partial failures without forcing the user to start over.

#### Implementation shape

- Persist resumable run state for:
  - pending tool call
  - tool trace
  - loop state
  - objective state
  - last proof
- Add recovery paths:
  - auto-resume after transient disconnect
  - manual resume after long pause
  - takeover mode where the user can continue from the stuck state
- Detect common failure classes:
  - stalled hosted run
  - repeated identical tool call
  - invalid proof
  - permission block
  - model error

#### Major subsystems

- `lib/playground/tool-loop.ts`
- host run persistence
- desktop and web resume UI
- error classification layer

#### Dependencies

- Stable persisted run envelope
- Strong event and tool state normalization

#### Risks

- Resuming with stale context can make runs unsafe
- Recovery logic can create duplicate actions

#### Acceptance criteria

- Interrupted runs can be resumed without losing state
- Takeover mode shows exactly what Binary was trying to do
- Duplicate mutation actions are prevented on resume

---

### 4. First-Class Model Routing

#### User outcome

Users can tell which model is answering, which model is orchestrating, and how fallback behaves.

#### Implementation shape

- Support explicit routing fields:
  - `chatModelSource`
  - `chatModelAlias`
  - `orchestratorModelSource`
  - `orchestratorModelAlias`
  - `fallbackApplied`
- Separate policy for:
  - conversation model
  - coding/orchestration model
  - desktop autonomy model
- Add per-session override UI and persistent preferences.
- Add health and validation status for connected providers.

#### Major subsystems

- model registry and BYOM resolution
- chat bootstrap and assist routing
- dashboard and desktop settings

#### Dependencies

- Connected provider storage
- model capability metadata

#### Risks

- Users get confused if model naming is inconsistent
- Poor fallback handling makes runs feel unpredictable

#### Acceptance criteria

- Every run shows model provenance
- Session-level override works without breaking saved defaults
- Repo and autonomy tasks stay on certified orchestrator models by default

---

### 5. Better Memory

#### User outcome

Binary feels like it knows the user, the repo, and repeated habits without needing repetitive prompting.

#### Implementation shape

- Add layered memory:
  - user-wide preferences
  - machine habits and app aliases
  - workspace conventions
  - session summaries
- Distinguish:
  - explicit memory the user approves
  - inferred memory that can be edited or removed
- Add memory cards in UI for inspection and deletion.
- Use memory in target inference, model routing, and autonomy suggestions.

#### Major subsystems

- playground user profile
- workspace memory store
- machine autonomy app index
- UI for memory editing

#### Dependencies

- clean memory schema
- ranking rules for what memories are promoted

#### Risks

- Memory becomes noisy and lowers quality
- Privacy expectations become unclear

#### Acceptance criteria

- Binary uses stored preferences in later runs
- Users can view and delete learned memories
- Memory improves target inference measurably

---

### 6. Safer Autonomy Defaults

#### User outcome

Autonomous runs feel powerful but not reckless.

#### Implementation shape

- Require verification after meaningful external actions:
  - app launch
  - browser navigation
  - file writes outside workspace
  - shell commands with side effects
- Add bounded retry policies with reason-specific caps.
- Add undo/checkpoint hooks wherever rollback is possible.
- Add preflight safety checks for desktop and shell actions.

#### Major subsystems

- tool-loop repair logic
- binary host tool execution
- desktop proof capture
- command classification and rollback metadata

#### Dependencies

- stronger proof model
- better action categorization

#### Risks

- Too much verification slows simple tasks
- Rollback promises can overstate what is actually reversible

#### Acceptance criteria

- Autonomy retries are bounded and visible
- External actions do not silently succeed without proof
- Users can stop unsafe behavior immediately

---

## Phase 2: High-Leverage Product Expansion

### 7. Teach-And-Replay Workflows

#### User outcome

Users can demonstrate a task once and turn it into a reusable AI routine.

#### Implementation shape

- Add recording mode:
  - capture user-approved actions
  - annotate decisions and proof
- Convert a recorded run into:
  - a reusable automation
  - a background agent template
  - a skill or macro
- Support editable replay plans with safe variable slots:
  - app name
  - URL
  - project root
  - command args

#### Acceptance criteria

- A demonstrated flow can be replayed later with reviewable steps
- Users can inspect and edit the generated routine before activation

---

### 8. Background Agents With Conditions

#### User outcome

Binary can wake up and act on useful triggers without constant prompting.

#### Implementation shape

- Add trigger families:
  - schedule
  - file change
  - process start/stop
  - notification
  - manual wake
- Background agents should enqueue ordinary orchestrated runs, not use a separate engine.
- Add guardrails:
  - max run count per interval
  - allowed tool families
  - allowed workspaces
  - user-visible timeline entries

#### Acceptance criteria

- Agent triggers create normal runs with full transparency
- Users can pause, edit, and delete agents easily

---

### 9. Browser-Native Automation

#### User outcome

Binary can reliably operate real web apps, not just open URLs.

#### Implementation shape

- Add browser tool families for:
  - open tab
  - list tabs
  - focus tab
  - inspect DOM/accessibility tree
  - click/type/scroll
  - extract visible structured data
- Prefer structured browser inspection over screenshot-only automation.
- Integrate browser proof into the same timeline model.

#### Acceptance criteria

- Binary can complete multi-step browser tasks with proof
- Browser actions are inspectable and interruptible

---

### 10. Workspace Intelligence

#### User outcome

Binary reprompts less, picks better targets, and validates work more intelligently.

#### Implementation shape

- Improve target inference from:
  - diagnostics
  - git diff
  - recently touched files
  - project conventions
  - memory
- Add smarter validation planning:
  - narrow test selection
  - package-manager-aware commands
  - repo-type heuristics
- Add file importance ranking and confidence surfaces.

#### Acceptance criteria

- Higher first-try target accuracy
- Fewer redundant inspection loops
- Better validation command choice across common stacks

---

### 11. Multi-Agent Collaboration

#### User outcome

Binary can split harder tasks into roles without becoming chaotic.

#### Implementation shape

- Add role templates:
  - planner
  - implementer
  - verifier
  - desktop operator
- Add shared context board and result-merging rules.
- Surface delegated work in one unified timeline.

#### Acceptance criteria

- Parallel agents can cooperate without losing traceability
- Users can see ownership and progress per sub-agent

---

### 12. Cost And Reliability Modes

#### User outcome

Users can choose how aggressive or careful Binary should be.

#### Implementation shape

- Add run presets:
  - fast
  - balanced
  - careful
  - max autonomy
- Presets tune:
  - model choice
  - retry depth
  - proof strictness
  - token budget
  - tool-step budget

#### Acceptance criteria

- Different presets materially change run behavior
- Users can understand the tradeoff before starting a run

---

## Phase 3: Future Magic

### 13. Cross-Device Orchestration

#### User outcome

One Binary can coordinate work across desktop, laptop, and cloud environments.

#### Implementation shape

- Add machine registration and capability discovery
- Add remote execution broker with per-machine trust controls
- Let one run route subtasks to different targets

#### Acceptance criteria

- One session can coordinate more than one machine safely

---

### 14. Personal Operating Modes

#### User outcome

Users can trigger broad environment transformations like “work mode” or “gaming mode.”

#### Implementation shape

- Compose:
  - app actions
  - browser actions
  - system settings
  - notifications
  - focus automations
- Back these with teach-and-replay plus editable routines.

#### Acceptance criteria

- Users can trigger stable personal modes with one command

---

### 15. Long-Horizon Task Execution

#### User outcome

Binary can make progress on large tasks over hours, not just minutes.

#### Implementation shape

- Break work into resumable subgoals
- Add periodic summaries and confidence checks
- Add idle waiting and re-entry logic
- Add “continue while I’m away” mode with stricter safety policy

#### Acceptance criteria

- Long tasks remain inspectable and resumable
- Users receive meaningful progress summaries over time

---

### 16. Self-Improving Skills

#### User outcome

Binary gets better from successful work instead of forgetting everything.

#### Implementation shape

- Detect repeated successful patterns
- Suggest converting them into:
  - reusable prompts
  - local skills
  - automations
  - routines
- Require user approval before activation

#### Acceptance criteria

- Binary can propose useful reusable skills from past work
- Users can approve, edit, or reject them

---

### 17. Living System Model

#### User outcome

Binary understands the user’s machine and habits deeply enough to feel proactive and natural.

#### Implementation shape

- Build a privacy-bounded machine model:
  - installed apps
  - preferred launch targets
  - recurring folders
  - active browser contexts
  - common routines
- Use this model only through visible, user-editable memory layers.

#### Acceptance criteria

- Machine understanding improves execution quality
- Users can inspect and prune what Binary “knows”

---

### 18. Shared Multiplayer Agents

#### User outcome

Teams can collaborate with Binary on shared tasks and shared environments.

#### Implementation shape

- Add shared sessions, role-based approvals, and audit trails
- Add team-scoped memory and automation ownership
- Add collaborative run handoff and reviewer gates

#### Acceptance criteria

- Teams can collaborate on one run without losing accountability

---

## Recommended Delivery Order

### V1

- Unified run timeline
- Trust and permissions control center
- Reliable resume and takeover
- First-class model routing
- Better memory
- Safer autonomy defaults

### V1.5

- Teach-and-replay workflows
- Background agents with conditions
- Browser-native automation
- Workspace intelligence
- Cost and reliability modes

### V2

- Multi-agent collaboration
- Cross-device orchestration
- Personal operating modes
- Long-horizon execution
- Self-improving skills
- Living system model
- Shared multiplayer agents

---

## Suggested Tracking Structure

When we start implementation, each roadmap item should get:

- one design doc
- one issue epic
- one acceptance checklist
- one benchmark or telemetry definition

Suggested naming convention:

- `BINARY-FOUNDATION-*`
- `BINARY-AUTONOMY-*`
- `BINARY-BROWSER-*`
- `BINARY-MEMORY-*`
- `BINARY-BYOM-*`
- `BINARY-FUTURE-*`

---

## Immediate Next Candidates

If we want maximum product leverage from here, the next three build targets should be:

1. Unified run timeline
2. Trust and permissions control center
3. Better memory and model routing polish

Those three would make everything else easier to build, easier to debug, and much easier for users to trust.
