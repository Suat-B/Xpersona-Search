import { MachineWorldModelService } from "./machine-world-model.js";

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type PendingToolCall = {
  step: number;
  adapter: string;
  requiresClientExecution: boolean;
  toolCall: ToolCall;
  availableTools?: string[];
  createdAt: string;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  ok: boolean;
  blocked?: boolean;
  summary: string;
  data?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function fail(toolCall: ToolCall, summary: string): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: false,
    summary,
    error: summary,
    createdAt: nowIso(),
  };
}

function ok(toolCall: ToolCall, summary: string, data: Record<string, unknown> = {}): ToolResult {
  return {
    toolCallId: toolCall.id,
    name: toolCall.name,
    ok: true,
    summary,
    data: {
      lane: "world_model",
      ...data,
    },
    createdAt: nowIso(),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export class WorldToolExecutor {
  constructor(private readonly worldModel: MachineWorldModelService) {}

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};

    if (toolCall.name === "world_get_summary") {
      const summary = await this.worldModel.getSummary();
      return ok(toolCall, "Loaded the current machine world-model summary.", summary as Record<string, unknown>);
    }

    if (toolCall.name === "world_get_active_context") {
      const context = await this.worldModel.getActiveContext();
      return ok(toolCall, "Loaded the current active machine context.", context);
    }

    if (toolCall.name === "world_get_beliefs") {
      const beliefs = await this.worldModel.getBeliefs({
        subjectId: typeof args.subjectId === "string" ? args.subjectId : undefined,
        kind: typeof args.kind === "string" ? args.kind : undefined,
        status:
          args.status === "active" || args.status === "stale" || args.status === "expired" || args.status === "contradicted"
            ? args.status
            : undefined,
        limit: clamp(Number(args.limit || 24), 1, 100),
      });
      return ok(toolCall, `Loaded ${beliefs.length} world belief(s).`, { beliefs });
    }

    if (toolCall.name === "world_get_goals") {
      const goals = await this.worldModel.getGoals({
        status:
          args.status === "open" || args.status === "in_progress" || args.status === "blocked" || args.status === "completed"
            ? args.status
            : undefined,
        runId: typeof args.runId === "string" ? args.runId : undefined,
        limit: clamp(Number(args.limit || 24), 1, 100),
      });
      return ok(toolCall, `Loaded ${goals.length} world goal(s).`, { goals });
    }

    if (toolCall.name === "world_query_episodes") {
      const episodes = await this.worldModel.queryEpisodes({
        query: typeof args.query === "string" ? args.query : undefined,
        kind: typeof args.kind === "string" ? args.kind : undefined,
        status: args.status === "open" || args.status === "completed" || args.status === "blocked" ? args.status : undefined,
        limit: clamp(Number(args.limit || 16), 1, 100),
      });
      return ok(toolCall, `Loaded ${episodes.length} world episode(s).`, { episodes });
    }

    if (toolCall.name === "world_register_goal") {
      const title = String(args.title || args.label || "").trim();
      if (!title) return fail(toolCall, "world_register_goal requires title.");
      const goal = await this.worldModel.registerGoal({
        title,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        runId: typeof args.runId === "string" ? args.runId : undefined,
        entityIds: Array.isArray(args.entityIds) ? args.entityIds.map((item) => String(item)) : [],
        progress: typeof args.progress === "number" ? args.progress : undefined,
        confidence: typeof args.confidence === "number" ? args.confidence : undefined,
        subgoals: Array.isArray(args.subgoals) ? args.subgoals.map((item) => String(item)) : [],
      });
      return ok(toolCall, `Registered goal ${goal.title}.`, goal as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "world_query_graph") {
      const result = await this.worldModel.queryGraph({
        query: typeof args.query === "string" ? args.query : undefined,
        type: typeof args.type === "string" ? args.type : undefined,
        limit: clamp(Number(args.limit || 12), 1, 50),
      });
      return ok(toolCall, `Found ${result.nodes.length} graph node(s).`, result as Record<string, unknown>);
    }

    if (toolCall.name === "world_get_neighbors") {
      const nodeId = String(args.nodeId || "").trim();
      if (!nodeId) return fail(toolCall, "world_get_neighbors requires nodeId.");
      const result = await this.worldModel.getNeighbors(nodeId, clamp(Number(args.limit || 16), 1, 64));
      return ok(toolCall, result.node ? `Loaded neighbors for ${result.node.label}.` : "The requested world-model node was not found.", result as Record<string, unknown>);
    }

    if (toolCall.name === "world_get_recent_changes") {
      const changes = await this.worldModel.getRecentChanges(clamp(Number(args.limit || 20), 1, 100));
      return ok(toolCall, `Loaded ${changes.length} recent world-model change(s).`, { changes });
    }

    if (toolCall.name === "world_get_attention_queue") {
      const items = await this.worldModel.getAttentionQueue({
        limit: clamp(Number(args.limit || 12), 1, 100),
      });
      return ok(toolCall, `Loaded ${items.length} world attention item(s).`, { items });
    }

    if (toolCall.name === "world_get_route_stats") {
      const stats = await this.worldModel.getRouteStats({
        kind: typeof args.kind === "string" ? args.kind : undefined,
        featureKey: typeof args.featureKey === "string" ? args.featureKey : undefined,
        limit: clamp(Number(args.limit || 12), 1, 100),
      });
      return ok(toolCall, `Loaded ${stats.length} world route stat record(s).`, { stats });
    }

    if (toolCall.name === "world_get_affordances") {
      const affordances = await this.worldModel.getAffordances();
      return ok(toolCall, "Loaded current machine affordances.", affordances as Record<string, unknown>);
    }

    if (toolCall.name === "world_find_routine") {
      const query = String(args.query || "").trim();
      const routines = await this.worldModel.findRoutine(query, clamp(Number(args.limit || 8), 1, 24));
      return ok(toolCall, routines.length ? `Found ${routines.length} routine(s).` : "No matching routines were found.", { routines });
    }

    if (toolCall.name === "world_record_observation") {
      const label = String(args.label || "").trim();
      const summary = String(args.summary || label || "Recorded observation").trim();
      if (!label) return fail(toolCall, "world_record_observation requires label.");
      const result = await this.worldModel.recordObservation({
        label,
        summary,
        runId: typeof args.runId === "string" ? args.runId : undefined,
        data: args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>) : {},
      });
      return ok(toolCall, summary, result as Record<string, unknown>);
    }

    if (toolCall.name === "world_record_proof") {
      const label = String(args.label || "").trim();
      const summary = String(args.summary || label || "Recorded proof").trim();
      if (!label) return fail(toolCall, "world_record_proof requires label.");
      const proof = await this.worldModel.recordProof({
        label,
        summary,
        runId: typeof args.runId === "string" ? args.runId : undefined,
        toolName: typeof args.toolName === "string" ? args.toolName : undefined,
        nodeIds: Array.isArray(args.nodeIds) ? args.nodeIds.map((item) => String(item)) : [],
        data: args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>) : {},
      });
      return ok(toolCall, summary, proof as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "world_commit_memory") {
      const label = String(args.label || "").trim();
      const summary = String(args.summary || label || "Committed world memory").trim();
      if (!label) return fail(toolCall, "world_commit_memory requires label.");
      const commit = await this.worldModel.commitMemory({
        label,
        summary,
        scope:
          args.scope === "workspace" || args.scope === "domain" || args.scope === "run" || args.scope === "machine"
            ? args.scope
            : "machine",
        tags: Array.isArray(args.tags) ? args.tags.map((item) => String(item)) : [],
        data: args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>) : {},
      });
      return ok(toolCall, summary, commit as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "world_predict_outcomes") {
      const predictions = await this.worldModel.predictOutcomes({
        candidates: Array.isArray(args.candidates)
          ? args.candidates
              .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
              .map((item) => ({
                id: typeof item.id === "string" ? item.id : undefined,
                candidateId: typeof item.candidateId === "string" ? item.candidateId : undefined,
                kind: typeof item.kind === "string" ? item.kind : undefined,
                steps: Array.isArray(item.steps) ? item.steps.map((step) => String(step)) : undefined,
                requiresVisibleInteraction: item.requiresVisibleInteraction === true,
                confidence: typeof item.confidence === "number" ? item.confidence : undefined,
              }))
          : undefined,
        limit: clamp(Number(args.limit || 6), 1, 24),
      });
      return ok(toolCall, `Predicted ${predictions.length} candidate outcome(s).`, { predictions });
    }

    if (toolCall.name === "world_explain_route") {
      const explanation = await this.worldModel.explainRoute({
        candidateId: typeof args.candidateId === "string" ? args.candidateId : undefined,
        claim: typeof args.claim === "string" ? args.claim : undefined,
        kind: typeof args.kind === "string" ? args.kind : undefined,
      });
      return ok(toolCall, "Explained the current world-model route preference.", explanation as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "world_record_route_outcome") {
      const outcome =
        args.outcome === "success" ||
        args.outcome === "blocked" ||
        args.outcome === "fallback" ||
        args.outcome === "verification_failure" ||
        args.outcome === "focus_conflict" ||
        args.outcome === "takeover_required" ||
        args.outcome === "cancelled"
          ? args.outcome
          : null;
      if (!outcome) return fail(toolCall, "world_record_route_outcome requires a valid outcome.");
      const record = await this.worldModel.recordRouteOutcome({
        decisionId: typeof args.decisionId === "string" ? args.decisionId : undefined,
        runId: typeof args.runId === "string" ? args.runId : undefined,
        routeKind: typeof args.routeKind === "string" ? args.routeKind : undefined,
        featureKey: typeof args.featureKey === "string" ? args.featureKey : undefined,
        toolFamily: typeof args.toolFamily === "string" ? args.toolFamily : undefined,
        outcome,
        advancedGoal: args.advancedGoal === true,
        verificationStatus:
          args.verificationStatus === "passed" || args.verificationStatus === "failed" ? args.verificationStatus : "unknown",
        fallbackToRouteKind: typeof args.fallbackToRouteKind === "string" ? args.fallbackToRouteKind : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
      });
      return ok(toolCall, `Recorded ${record.outcome} route outcome for ${record.routeKind}.`, record as unknown as Record<string, unknown>);
    }

    if (toolCall.name === "world_score_route") {
      const routes = Array.isArray(args.routes) ? args.routes : [];
      const scored = await this.worldModel.scoreRoute({
        routes: routes as Array<{ id?: string; kind?: string; steps?: string[]; requiresVisibleInteraction?: boolean; confidence?: number }>,
      });
      return ok(toolCall, `Scored ${scored.length} possible route(s).`, { routes: scored });
    }

    return fail(toolCall, `Unknown world-model tool ${toolCall.name}.`);
  }
}
