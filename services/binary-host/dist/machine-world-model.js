import { createHash, randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
function nowIso() {
    return new Date().toISOString();
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}
function hashKey(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function normalizePath(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return null;
    try {
        return path.resolve(raw);
    }
    catch {
        return raw;
    }
}
function normalizeUrl(value) {
    const raw = String(value || "").trim();
    return raw || null;
}
function safeLabel(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
}
function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function uniqueStrings(values) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}
function getOrigin(urlValue) {
    if (!urlValue)
        return null;
    try {
        return new URL(urlValue).origin;
    }
    catch {
        return null;
    }
}
function buildRoutineSlug(parts) {
    return parts
        .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
        .filter(Boolean)
        .slice(0, 4)
        .join("--");
}
export class MachineWorldModelService {
    storagePath;
    file;
    loaded = false;
    writeChain = Promise.resolve();
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.file = this.buildEmpty();
    }
    buildEmpty() {
        return {
            version: 1,
            graphVersion: 0,
            lastUpdatedAt: nowIso(),
            nodes: [],
            edges: [],
            routines: [],
            recentChanges: [],
            proofs: [],
            memoryCommits: [],
            liveState: {},
        };
    }
    async initialize() {
        if (this.loaded)
            return;
        this.loaded = true;
        if (!existsSync(this.storagePath)) {
            await this.persist();
            return;
        }
        try {
            const raw = JSON.parse(await fs.readFile(this.storagePath, "utf8"));
            this.file = {
                ...this.buildEmpty(),
                ...raw,
                version: 1,
                nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
                edges: Array.isArray(raw.edges) ? raw.edges : [],
                routines: Array.isArray(raw.routines) ? raw.routines : [],
                recentChanges: Array.isArray(raw.recentChanges) ? raw.recentChanges : [],
                proofs: Array.isArray(raw.proofs) ? raw.proofs : [],
                memoryCommits: Array.isArray(raw.memoryCommits) ? raw.memoryCommits : [],
                liveState: toObject(raw.liveState) || {},
            };
        }
        catch {
            this.file = this.buildEmpty();
            await this.persist();
        }
    }
    async persist() {
        this.file.lastUpdatedAt = nowIso();
        this.writeChain = this.writeChain.then(async () => {
            await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
            await fs.writeFile(this.storagePath, JSON.stringify(this.file, null, 2), "utf8");
        });
        await this.writeChain;
    }
    touchGraph() {
        this.file.graphVersion += 1;
        this.file.lastUpdatedAt = nowIso();
    }
    pushChange(change) {
        const next = {
            id: randomUUID(),
            at: nowIso(),
            ...change,
        };
        this.file.recentChanges = [next, ...this.file.recentChanges].slice(0, 300);
        return next;
    }
    upsertNode(input) {
        const now = input.observedAt || nowIso();
        const existing = this.file.nodes.find((node) => node.type === input.type && node.key === input.key);
        if (existing) {
            existing.label = input.label || existing.label;
            existing.data = { ...existing.data, ...(input.data || {}) };
            existing.confidence = typeof input.confidence === "number" ? input.confidence : existing.confidence;
            existing.updatedAt = now;
            existing.lastObservedAt = now;
            return existing;
        }
        const created = {
            id: `${input.type}_${hashKey(`${input.type}:${input.key}`)}`,
            type: input.type,
            key: input.key,
            label: input.label,
            data: input.data || {},
            confidence: typeof input.confidence === "number" ? input.confidence : 0.7,
            createdAt: now,
            updatedAt: now,
            lastObservedAt: now,
        };
        this.file.nodes.push(created);
        this.touchGraph();
        this.pushChange({
            kind: "node_observed",
            summary: `Observed ${created.type}: ${created.label}`,
            nodeIds: [created.id],
        });
        return created;
    }
    upsertEdge(input) {
        const now = input.observedAt || nowIso();
        const existing = this.file.edges.find((edge) => edge.type === input.type && edge.from === input.from && edge.to === input.to);
        if (existing) {
            existing.data = { ...existing.data, ...(input.data || {}) };
            existing.weight = typeof input.weight === "number" ? input.weight : existing.weight;
            existing.updatedAt = now;
            existing.lastObservedAt = now;
            return existing;
        }
        const created = {
            id: `${input.type}_${hashKey(`${input.type}:${input.from}:${input.to}`)}`,
            type: input.type,
            from: input.from,
            to: input.to,
            data: input.data || {},
            weight: typeof input.weight === "number" ? input.weight : 1,
            createdAt: now,
            updatedAt: now,
            lastObservedAt: now,
        };
        this.file.edges.push(created);
        this.touchGraph();
        this.pushChange({
            kind: "edge_observed",
            summary: `Observed relation ${created.type}`,
            edgeIds: [created.id],
            nodeIds: [created.from, created.to],
        });
        return created;
    }
    addProof(input) {
        const proof = {
            id: randomUUID(),
            at: nowIso(),
            ...input,
        };
        this.file.proofs = [proof, ...this.file.proofs].slice(0, 240);
        this.pushChange({
            kind: "proof_recorded",
            summary: proof.summary,
            runId: proof.runId,
            nodeIds: proof.nodeIds,
            proofId: proof.id,
            metadata: proof.data,
        });
        return proof;
    }
    upsertRoutine(input) {
        const now = nowIso();
        const existing = this.file.routines.find((routine) => routine.slug === input.slug);
        if (existing) {
            existing.label = input.label;
            existing.description = input.description;
            existing.triggers = uniqueStrings([...existing.triggers, ...input.triggers]);
            existing.steps = uniqueStrings([...existing.steps, ...input.steps]).slice(0, 8);
            existing.evidenceCount += 1;
            existing.confidence = Math.min(0.98, existing.confidence + 0.08);
            existing.updatedAt = now;
            existing.lastSeenAt = now;
            return existing;
        }
        const created = {
            id: `routine_${hashKey(input.slug)}`,
            slug: input.slug,
            label: input.label,
            description: input.description,
            triggers: uniqueStrings(input.triggers),
            steps: uniqueStrings(input.steps).slice(0, 8),
            confidence: 0.55,
            evidenceCount: 1,
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
        };
        this.file.routines.push(created);
        this.touchGraph();
        this.pushChange({
            kind: "routine_distilled",
            summary: `Distilled routine ${created.label}`,
            nodeIds: [created.id],
        });
        return created;
    }
    setActiveState(patch) {
        this.file.liveState = { ...this.file.liveState, ...patch };
    }
    lookupLabel(nodeId) {
        if (!nodeId)
            return undefined;
        return this.file.nodes.find((node) => node.id === nodeId)?.label;
    }
    inferAffordances() {
        const actionsAvailable = new Set();
        const backgroundSafe = new Set();
        const visibleRequired = new Set();
        const blocked = new Set();
        const highConfidence = new Set();
        if (this.file.liveState.activeWorkspaceId) {
            actionsAvailable.add("inspect_workspace");
            actionsAvailable.add("run_terminal_validation");
            backgroundSafe.add("run_terminal_validation");
            highConfidence.add("run_terminal_validation");
        }
        if (this.file.liveState.activePageId) {
            actionsAvailable.add("inspect_browser_page");
            actionsAvailable.add("background_browser_query");
            backgroundSafe.add("background_browser_query");
            highConfidence.add("inspect_browser_page");
        }
        if (this.file.liveState.activeWindowId) {
            actionsAvailable.add("desktop_observe");
            backgroundSafe.add("desktop_observe");
        }
        if (this.file.liveState.focusLeaseActive)
            blocked.add("visible_foreground_activation");
        else
            visibleRequired.add("visible_foreground_activation");
        return {
            actionsAvailable: Array.from(actionsAvailable),
            backgroundSafe: Array.from(backgroundSafe),
            visibleRequired: Array.from(visibleRequired),
            blocked: Array.from(blocked),
            highConfidence: Array.from(highConfidence),
        };
    }
    async ingestSnapshot(input) {
        await this.initialize();
        const observedAt = nowIso();
        const nodeIds = [];
        const task = compactWhitespace(input.task);
        const sessionNode = this.upsertNode({
            type: "session",
            key: "local-user-session",
            label: "Local user session",
            data: {
                focusLeaseSource: input.focusLease?.source || null,
                focusLeaseSurface: input.focusLease?.surface || null,
                task: task || null,
            },
            confidence: 0.98,
            observedAt,
        });
        nodeIds.push(sessionNode.id);
        this.setActiveState({
            focusLeaseActive: Boolean(input.focusLease),
            ...(input.runId ? { lastRunId: input.runId } : {}),
            ...(task ? { lastTask: task } : {}),
        });
        const desktop = toObject(input.desktopContext);
        if (desktop) {
            const platformLabel = safeLabel(desktop.platform, "Desktop");
            const deviceNode = this.upsertNode({
                type: "device",
                key: `device:${platformLabel}`,
                label: platformLabel,
                data: { platform: desktop.platform || null },
                confidence: 0.96,
                observedAt,
            });
            nodeIds.push(deviceNode.id);
            this.upsertEdge({ type: "active_in_session", from: deviceNode.id, to: sessionNode.id, observedAt });
            const activeWindow = toObject(desktop.activeWindow);
            if (activeWindow) {
                const appName = safeLabel(activeWindow.app, "Unknown App");
                const appNode = this.upsertNode({
                    type: "app",
                    key: `app:${appName.toLowerCase()}`,
                    label: appName,
                    data: { aliases: [] },
                    observedAt,
                });
                const windowNode = this.upsertNode({
                    type: "window",
                    key: `window:${activeWindow.id || appName}:${activeWindow.title || "untitled"}`,
                    label: safeLabel(activeWindow.title, appName),
                    data: {
                        app: appName,
                        title: activeWindow.title || null,
                        windowId: activeWindow.id || null,
                    },
                    observedAt,
                });
                nodeIds.push(appNode.id, windowNode.id);
                this.upsertEdge({ type: "active_in_session", from: windowNode.id, to: sessionNode.id, observedAt });
                this.upsertEdge({ type: "launched_by", from: windowNode.id, to: appNode.id, observedAt });
                this.setActiveState({ activeWindowId: windowNode.id });
            }
            for (const item of toArray(desktop.discoveredApps).slice(0, 40)) {
                const name = safeLabel(item.name, "Desktop app");
                const appNode = this.upsertNode({
                    type: "app",
                    key: `app:${name.toLowerCase()}`,
                    label: name,
                    data: {
                        source: item.source || null,
                        aliases: toArray(item.aliases).slice(0, 8),
                        appId: item.id || null,
                    },
                    observedAt,
                });
                nodeIds.push(appNode.id);
            }
        }
        const workspaceRoot = normalizePath(input.workspaceRoot);
        if (workspaceRoot) {
            const workspaceNode = this.upsertNode({
                type: "workspace",
                key: workspaceRoot,
                label: path.basename(workspaceRoot) || workspaceRoot,
                data: { path: workspaceRoot },
                confidence: 0.95,
                observedAt,
            });
            const repoNode = this.upsertNode({
                type: "repo",
                key: workspaceRoot,
                label: path.basename(workspaceRoot) || workspaceRoot,
                data: { path: workspaceRoot },
                confidence: 0.92,
                observedAt,
            });
            this.upsertEdge({ type: "belongs_to_workspace", from: repoNode.id, to: workspaceNode.id, observedAt });
            this.upsertEdge({ type: "active_in_session", from: workspaceNode.id, to: sessionNode.id, observedAt });
            this.setActiveState({
                activeWorkspaceId: workspaceNode.id,
                activeRepoId: repoNode.id,
            });
            nodeIds.push(workspaceNode.id, repoNode.id);
        }
        const browser = toObject(input.browserContext);
        if (browser) {
            const browserName = safeLabel(browser.browserName, "Browser");
            const browserNode = this.upsertNode({
                type: "browser",
                key: `browser:${browserName.toLowerCase()}`,
                label: browserName,
                data: {
                    mode: browser.mode || null,
                    sessionHint: toObject(browser.sessionHint) || null,
                },
                confidence: 0.93,
                observedAt,
            });
            nodeIds.push(browserNode.id);
            this.upsertEdge({ type: "active_in_session", from: browserNode.id, to: sessionNode.id, observedAt });
            this.setActiveState({ browserMode: String(browser.mode || "") || undefined });
            const pages = [
                ...toArray(browser.openPages).slice(0, 16),
                ...toArray(browser.activePage ? [browser.activePage] : []),
            ];
            for (const page of pages) {
                const url = normalizeUrl(page.url);
                const title = safeLabel(page.title, url || String(page.id || "Browser page"));
                const pageNode = this.upsertNode({
                    type: "browser_page",
                    key: `page:${page.id || url || title}`,
                    label: title,
                    data: {
                        pageId: page.id || null,
                        url,
                        origin: page.origin || getOrigin(url),
                        title,
                    },
                    observedAt,
                });
                nodeIds.push(pageNode.id);
                this.upsertEdge({ type: "active_in_session", from: pageNode.id, to: browserNode.id, observedAt });
                const origin = getOrigin(url);
                if (origin) {
                    const domainNode = this.upsertNode({
                        type: "domain",
                        key: origin,
                        label: origin,
                        data: { origin },
                        observedAt,
                    });
                    nodeIds.push(domainNode.id);
                    this.upsertEdge({ type: "depends_on", from: pageNode.id, to: domainNode.id, observedAt });
                }
                if (browser.activePage && page.id === toObject(browser.activePage)?.id) {
                    this.setActiveState({ activePageId: pageNode.id });
                }
            }
        }
        this.pushChange({
            kind: "snapshot_ingested",
            summary: task ? `Updated world state for task: ${task}` : "Updated world state from local machine snapshot",
            runId: input.runId,
            nodeIds: uniqueStrings(nodeIds),
            metadata: {
                workspaceRoot: workspaceRoot || null,
                browserMode: this.file.liveState.browserMode || null,
            },
        });
        await this.persist();
    }
    async recordToolReceipt(input) {
        await this.initialize();
        const toolName = input.pendingToolCall.toolCall.name;
        const toolResult = input.toolResult;
        const observedAt = toolResult.createdAt || nowIso();
        const nodeIds = [];
        const toolNode = this.upsertNode({
            type: toolName === "run_command" ? "command" : "artifact",
            key: `${toolName}:${input.pendingToolCall.toolCall.id}`,
            label: toolName,
            data: {
                args: input.pendingToolCall.toolCall.arguments || {},
                summary: toolResult.summary,
                ok: toolResult.ok,
            },
            confidence: toolResult.ok ? 0.88 : 0.45,
            observedAt,
        });
        nodeIds.push(toolNode.id);
        const data = toObject(toolResult.data);
        const terminalState = toObject(data?.terminalState);
        if (terminalState) {
            const cwd = normalizePath(terminalState.cwd) || normalizePath(terminalState.projectRoot) || "terminal";
            const terminalNode = this.upsertNode({
                type: "terminal_session",
                key: `terminal:${cwd}`,
                label: path.basename(cwd) || cwd,
                data: {
                    cwd: terminalState.cwd || null,
                    projectRoot: terminalState.projectRoot || null,
                    stack: terminalState.stack || null,
                    lastCommand: terminalState.lastCommand || null,
                    lastCommandOutcome: terminalState.lastCommandOutcome || null,
                },
                observedAt,
            });
            nodeIds.push(terminalNode.id);
            this.upsertEdge({ type: "verified_by", from: terminalNode.id, to: toolNode.id, observedAt });
            this.setActiveState({ activeTerminalSessionId: terminalNode.id });
            const projectRoot = normalizePath(terminalState.projectRoot);
            if (projectRoot) {
                const repoNode = this.upsertNode({
                    type: "repo",
                    key: projectRoot,
                    label: path.basename(projectRoot) || projectRoot,
                    data: { path: projectRoot },
                    observedAt,
                });
                nodeIds.push(repoNode.id);
                this.upsertEdge({ type: "belongs_to_workspace", from: terminalNode.id, to: repoNode.id, observedAt });
            }
            if (toolResult.ok && typeof terminalState.lastCommand === "string" && terminalState.lastCommand.trim()) {
                const slug = buildRoutineSlug(["terminal", String(terminalState.stack || "generic"), terminalState.lastCommand]);
                this.upsertRoutine({
                    slug,
                    label: `Terminal flow: ${String(terminalState.lastCommand).trim().slice(0, 48)}`,
                    description: `Binary successfully used the terminal for ${String(terminalState.lastCommand).trim()}.`,
                    triggers: [String(terminalState.stack || "generic"), cwd],
                    steps: [String(terminalState.lastCommand).trim()],
                });
            }
        }
        const proof = toObject(data?.proof);
        if (proof) {
            this.addProof({
                label: safeLabel(proof.title, `${toolName} proof`),
                summary: compactWhitespace(toolResult.summary || proof.title || toolName),
                runId: input.runId,
                toolName,
                nodeIds: uniqueStrings(nodeIds),
                data: {
                    ...proof,
                    toolName,
                },
            });
        }
        const url = normalizeUrl(data?.url);
        const title = safeLabel(data?.title, url || "");
        if (url) {
            const origin = getOrigin(url);
            if (origin) {
                const domainNode = this.upsertNode({
                    type: "domain",
                    key: origin,
                    label: origin,
                    data: { origin },
                    observedAt,
                });
                nodeIds.push(domainNode.id);
                this.upsertEdge({ type: "recently_used_with", from: toolNode.id, to: domainNode.id, observedAt });
            }
            const pageNode = this.upsertNode({
                type: "browser_page",
                key: `page:${data?.pageId || url}`,
                label: title || url,
                data: {
                    pageId: data?.pageId || null,
                    url,
                    title: title || null,
                },
                observedAt,
            });
            nodeIds.push(pageNode.id);
            this.upsertEdge({ type: "verified_by", from: pageNode.id, to: toolNode.id, observedAt });
            this.setActiveState({ activePageId: pageNode.id });
            if (toolResult.ok) {
                const slug = buildRoutineSlug(["browser", origin || url, toolName]);
                this.upsertRoutine({
                    slug,
                    label: `Browser flow: ${origin || url}`,
                    description: `Binary successfully used ${toolName} on ${origin || url}.`,
                    triggers: uniqueStrings([origin, toolName]),
                    steps: uniqueStrings([title || url, toolName]),
                });
            }
        }
        this.pushChange({
            kind: "tool_recorded",
            summary: `${toolName} ${toolResult.ok ? "succeeded" : "failed"}: ${compactWhitespace(toolResult.summary).slice(0, 200)}`,
            runId: input.runId,
            nodeIds: uniqueStrings(nodeIds),
            metadata: {
                toolName,
                ok: toolResult.ok,
                task: input.task || null,
            },
        });
        await this.persist();
    }
    async recordObservation(input) {
        await this.initialize();
        const node = this.upsertNode({
            type: "artifact",
            key: `observation:${hashKey(`${input.label}:${JSON.stringify(input.data || {})}`)}`,
            label: input.label,
            data: input.data || {},
            observedAt: nowIso(),
        });
        this.pushChange({
            kind: "tool_recorded",
            summary: input.summary,
            runId: input.runId,
            nodeIds: [node.id],
        });
        await this.persist();
        return { ok: true, observationId: node.id };
    }
    async recordProof(input) {
        await this.initialize();
        const proof = this.addProof({
            label: input.label,
            summary: input.summary,
            runId: input.runId,
            toolName: input.toolName,
            nodeIds: uniqueStrings(input.nodeIds || []),
            data: input.data || {},
        });
        await this.persist();
        return proof;
    }
    async commitMemory(input) {
        await this.initialize();
        const commit = {
            id: randomUUID(),
            label: input.label,
            summary: input.summary,
            at: nowIso(),
            scope: input.scope || "machine",
            tags: uniqueStrings(input.tags || []),
            data: input.data || {},
        };
        this.file.memoryCommits = [commit, ...this.file.memoryCommits].slice(0, 240);
        this.pushChange({
            kind: "memory_committed",
            summary: commit.summary,
            metadata: {
                scope: commit.scope,
                tags: commit.tags,
            },
        });
        await this.persist();
        return commit;
    }
    async getSummary() {
        await this.initialize();
        const affordanceSummary = this.inferAffordances();
        const freshnessAgeMs = Date.now() - new Date(this.file.lastUpdatedAt).getTime();
        return {
            graphVersion: this.file.graphVersion,
            nodeCount: this.file.nodes.length,
            edgeCount: this.file.edges.length,
            routineCount: this.file.routines.length,
            proofCount: this.file.proofs.length,
            memoryCommitCount: this.file.memoryCommits.length,
            activeContext: {
                activeWindow: this.lookupLabel(this.file.liveState.activeWindowId),
                activePage: this.lookupLabel(this.file.liveState.activePageId),
                activeWorkspace: this.lookupLabel(this.file.liveState.activeWorkspaceId),
                activeRepo: this.lookupLabel(this.file.liveState.activeRepoId),
                browserMode: this.file.liveState.browserMode,
                focusLeaseActive: Boolean(this.file.liveState.focusLeaseActive),
            },
            affordanceSummary,
            recentChanges: this.file.recentChanges.slice(0, 8),
            environmentFreshness: {
                lastUpdatedAt: this.file.lastUpdatedAt,
                stale: freshnessAgeMs > 5 * 60_000,
            },
            machineRoutineIds: this.file.routines.slice(0, 8).map((routine) => routine.id),
        };
    }
    async getActiveContext() {
        await this.initialize();
        const summary = await this.getSummary();
        return {
            graphVersion: summary.graphVersion,
            sliceId: `world-slice-${summary.graphVersion}`,
            activeContext: summary.activeContext,
            recentChanges: summary.recentChanges.slice(0, 5),
            affordanceSummary: summary.affordanceSummary,
            environmentFreshness: summary.environmentFreshness,
            machineRoutineIds: summary.machineRoutineIds,
        };
    }
    async getRecentChanges(limit = 20) {
        await this.initialize();
        return this.file.recentChanges.slice(0, clamp(limit, 1, 100));
    }
    async queryGraph(input) {
        await this.initialize();
        const query = compactWhitespace(input.query).toLowerCase();
        const type = String(input.type || "").trim();
        const limit = clamp(Number(input.limit || 12), 1, 50);
        const nodes = this.file.nodes
            .filter((node) => {
            if (type && node.type !== type)
                return false;
            if (!query)
                return true;
            return (node.label.toLowerCase().includes(query) ||
                node.key.toLowerCase().includes(query) ||
                JSON.stringify(node.data).toLowerCase().includes(query));
        })
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
            .slice(0, limit);
        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = this.file.edges.filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to)).slice(0, limit * 2);
        return { nodes, edges };
    }
    async getNeighbors(nodeId, limit = 16) {
        await this.initialize();
        const node = this.file.nodes.find((item) => item.id === nodeId) || null;
        if (!node)
            return { node: null, neighbors: [], edges: [] };
        const edges = this.file.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).slice(0, clamp(limit, 1, 64));
        const neighborIds = uniqueStrings(edges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id !== nodeId));
        const neighbors = this.file.nodes.filter((item) => neighborIds.includes(item.id));
        return { node, neighbors, edges };
    }
    async getAffordances() {
        await this.initialize();
        return this.inferAffordances();
    }
    async findRoutine(query, limit = 8) {
        await this.initialize();
        const normalized = compactWhitespace(query).toLowerCase();
        return this.file.routines
            .filter((routine) => {
            if (!normalized)
                return true;
            return (routine.label.toLowerCase().includes(normalized) ||
                routine.description.toLowerCase().includes(normalized) ||
                routine.triggers.some((trigger) => trigger.toLowerCase().includes(normalized)) ||
                routine.steps.some((step) => step.toLowerCase().includes(normalized)));
        })
            .sort((a, b) => b.evidenceCount - a.evidenceCount || String(b.updatedAt).localeCompare(String(a.updatedAt)))
            .slice(0, clamp(limit, 1, 24));
    }
    async scoreRoute(input) {
        await this.initialize();
        const affordances = this.inferAffordances();
        return toArray(input.routes).map((route, index) => {
            const requiresVisibleInteraction = route.requiresVisibleInteraction === true;
            const confidence = Number(route.confidence || 0.5);
            const kind = String(route.kind || "route");
            const backgroundBonus = requiresVisibleInteraction ? 0 : 0.2;
            const focusPenalty = affordances.blocked.includes("visible_foreground_activation") && requiresVisibleInteraction ? 0.35 : 0;
            const score = Math.max(0, Math.min(1, confidence + backgroundBonus - focusPenalty));
            return {
                id: String(route.id || `route-${index + 1}`),
                score: Number(score.toFixed(3)),
                reason: requiresVisibleInteraction && focusPenalty > 0
                    ? `${kind} is blocked by the current focus policy.`
                    : `${kind} is compatible with the current machine affordances.`,
            };
        });
    }
    async getStatus() {
        await this.initialize();
        const summary = await this.getSummary();
        return {
            ok: true,
            storagePath: this.storagePath,
            graphVersion: summary.graphVersion,
            nodeCount: summary.nodeCount,
            edgeCount: summary.edgeCount,
            routineCount: summary.routineCount,
            proofCount: summary.proofCount,
            lastUpdatedAt: this.file.lastUpdatedAt,
        };
    }
}
