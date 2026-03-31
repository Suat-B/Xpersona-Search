function nowIso() {
    return new Date().toISOString();
}
function fail(toolCall, summary) {
    return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        summary,
        error: summary,
        createdAt: nowIso(),
    };
}
function ok(toolCall, summary, data = {}) {
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
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}
export class WorldToolExecutor {
    worldModel;
    constructor(worldModel) {
        this.worldModel = worldModel;
    }
    async execute(pendingToolCall) {
        const toolCall = pendingToolCall.toolCall;
        const args = toolCall.arguments || {};
        if (toolCall.name === "world_get_summary") {
            const summary = await this.worldModel.getSummary();
            return ok(toolCall, "Loaded the current machine world-model summary.", summary);
        }
        if (toolCall.name === "world_get_active_context") {
            const context = await this.worldModel.getActiveContext();
            return ok(toolCall, "Loaded the current active machine context.", context);
        }
        if (toolCall.name === "world_query_graph") {
            const result = await this.worldModel.queryGraph({
                query: typeof args.query === "string" ? args.query : undefined,
                type: typeof args.type === "string" ? args.type : undefined,
                limit: clamp(Number(args.limit || 12), 1, 50),
            });
            return ok(toolCall, `Found ${result.nodes.length} graph node(s).`, result);
        }
        if (toolCall.name === "world_get_neighbors") {
            const nodeId = String(args.nodeId || "").trim();
            if (!nodeId)
                return fail(toolCall, "world_get_neighbors requires nodeId.");
            const result = await this.worldModel.getNeighbors(nodeId, clamp(Number(args.limit || 16), 1, 64));
            return ok(toolCall, result.node ? `Loaded neighbors for ${result.node.label}.` : "The requested world-model node was not found.", result);
        }
        if (toolCall.name === "world_get_recent_changes") {
            const changes = await this.worldModel.getRecentChanges(clamp(Number(args.limit || 20), 1, 100));
            return ok(toolCall, `Loaded ${changes.length} recent world-model change(s).`, { changes });
        }
        if (toolCall.name === "world_get_affordances") {
            const affordances = await this.worldModel.getAffordances();
            return ok(toolCall, "Loaded current machine affordances.", affordances);
        }
        if (toolCall.name === "world_find_routine") {
            const query = String(args.query || "").trim();
            const routines = await this.worldModel.findRoutine(query, clamp(Number(args.limit || 8), 1, 24));
            return ok(toolCall, routines.length ? `Found ${routines.length} routine(s).` : "No matching routines were found.", { routines });
        }
        if (toolCall.name === "world_record_observation") {
            const label = String(args.label || "").trim();
            const summary = String(args.summary || label || "Recorded observation").trim();
            if (!label)
                return fail(toolCall, "world_record_observation requires label.");
            const result = await this.worldModel.recordObservation({
                label,
                summary,
                runId: typeof args.runId === "string" ? args.runId : undefined,
                data: args.data && typeof args.data === "object" ? args.data : {},
            });
            return ok(toolCall, summary, result);
        }
        if (toolCall.name === "world_record_proof") {
            const label = String(args.label || "").trim();
            const summary = String(args.summary || label || "Recorded proof").trim();
            if (!label)
                return fail(toolCall, "world_record_proof requires label.");
            const proof = await this.worldModel.recordProof({
                label,
                summary,
                runId: typeof args.runId === "string" ? args.runId : undefined,
                toolName: typeof args.toolName === "string" ? args.toolName : undefined,
                nodeIds: Array.isArray(args.nodeIds) ? args.nodeIds.map((item) => String(item)) : [],
                data: args.data && typeof args.data === "object" ? args.data : {},
            });
            return ok(toolCall, summary, proof);
        }
        if (toolCall.name === "world_commit_memory") {
            const label = String(args.label || "").trim();
            const summary = String(args.summary || label || "Committed world memory").trim();
            if (!label)
                return fail(toolCall, "world_commit_memory requires label.");
            const commit = await this.worldModel.commitMemory({
                label,
                summary,
                scope: args.scope === "workspace" || args.scope === "domain" || args.scope === "run" || args.scope === "machine"
                    ? args.scope
                    : "machine",
                tags: Array.isArray(args.tags) ? args.tags.map((item) => String(item)) : [],
                data: args.data && typeof args.data === "object" ? args.data : {},
            });
            return ok(toolCall, summary, commit);
        }
        if (toolCall.name === "world_score_route") {
            const routes = Array.isArray(args.routes) ? args.routes : [];
            const scored = await this.worldModel.scoreRoute({
                routes: routes,
            });
            return ok(toolCall, `Scored ${scored.length} possible route(s).`, { routes: scored });
        }
        return fail(toolCall, `Unknown world-model tool ${toolCall.name}.`);
    }
}
