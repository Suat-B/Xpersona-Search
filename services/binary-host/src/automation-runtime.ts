import { createHmac, randomUUID } from "node:crypto";
import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";

export type BinaryAutomationPolicy = "autonomous" | "observe_only" | "approval_before_mutation";
export type BinaryAutomationTriggerKind = "manual" | "schedule_nl" | "file_event" | "process_event" | "notification";

export type BinaryAutomationTrigger =
  | {
      kind: "manual";
      workspaceRoot?: string;
    }
  | {
      kind: "schedule_nl";
      scheduleText: string;
      workspaceRoot?: string;
    }
  | {
      kind: "file_event";
      workspaceRoot: string;
      includes?: string[];
      excludes?: string[];
    }
  | {
      kind: "process_event";
      workspaceRoot?: string;
      query: string;
    }
  | {
      kind: "notification";
      workspaceRoot?: string;
      topic?: string;
      query?: string;
    };

export type BinaryAutomationDefinition = {
  id: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  trigger: BinaryAutomationTrigger;
  policy: BinaryAutomationPolicy;
  workspaceRoot?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastTriggerAt?: string;
  lastRunId?: string;
  lastTriggerSummary?: string;
  nextRunAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryError?: string;
  deliveryHealth?: "healthy" | "failing" | "idle";
};

export type BinaryWebhookSubscription = {
  id: string;
  url: string;
  status: "active" | "paused";
  secret?: string;
  automationId?: string;
  events?: string[];
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  failureCount?: number;
};

export type StoredAutomationEvent = {
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
};

type DeliveryAttempt = {
  id: string;
  subscriptionId: string;
  automationId?: string;
  eventName: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attemptCount: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

type AutomationRuntimeState = {
  version: 1;
  events: Record<string, StoredAutomationEvent[]>;
  deliveries: DeliveryAttempt[];
  processState: {
    lastFingerprint?: string;
  };
};

type RuntimeConfig = {
  automations: BinaryAutomationDefinition[];
  webhookSubscriptions: BinaryWebhookSubscription[];
  trustedWorkspaceRoots: string[];
};

type QueueRunResult = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AutomationRuntimeInput = {
  storagePath: string;
  readConfig: () => Promise<RuntimeConfig>;
  writeConfig: (config: RuntimeConfig) => Promise<void>;
  queueAutomationRun: (input: {
    automation: BinaryAutomationDefinition;
    triggerSummary: string;
    triggerKind: BinaryAutomationTriggerKind;
    eventId: string;
    workspaceRoot?: string;
  }) => Promise<QueueRunResult>;
  getDesktopSnapshot: () => Promise<{
    activeWindow?: { id?: string; title?: string; app?: string };
  }>;
  fetchImpl?: typeof fetch;
};

const DEFAULT_STATE: AutomationRuntimeState = {
  version: 1,
  events: {},
  deliveries: [],
  processState: {},
};

const MAX_AUTOMATION_EVENTS = 400;
const MAX_DELIVERIES = 600;
const DELIVERY_RETRY_LIMIT = 5;
const SCHEDULER_INTERVAL_MS = 30_000;
const PROCESS_POLL_MS = 5_000;
const DELIVERY_POLL_MS = 5_000;
const FILE_DEBOUNCE_MS = 2_500;
const DEFAULT_FILE_IGNORE = [
  /\.git([\\/]|$)/i,
  /node_modules([\\/]|$)/i,
  /\.next([\\/]|$)/i,
  /dist([\\/]|$)/i,
  /build([\\/]|$)/i,
  /coverage([\\/]|$)/i,
  /artifacts([\\/]|$)/i,
  /logs([\\/]|$)/i,
  /\.cache([\\/]|$)/i,
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePath(input: string): string {
  return path.resolve(input);
}

function compactWhitespace(input: unknown): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function encodeSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function matchesEventFilter(eventName: string, filters: string[] | undefined): boolean {
  if (!filters?.length) return true;
  return filters.some((item) => item === "*" || item === eventName);
}

function fingerprintActiveWindow(activeWindow?: { title?: string; app?: string }): string {
  return compactWhitespace([activeWindow?.app, activeWindow?.title].filter(Boolean).join("|")).toLowerCase();
}

function triggerWorkspaceRoot(trigger: BinaryAutomationTrigger): string | undefined {
  if ("workspaceRoot" in trigger && typeof trigger.workspaceRoot === "string" && trigger.workspaceRoot.trim()) {
    return normalizePath(trigger.workspaceRoot);
  }
  return undefined;
}

function parseNaturalLanguageHour(raw: string): { hour: number; minute: number } | null {
  const normalized = compactWhitespace(raw).toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (match) {
    let hour = Number(match[1] || 0);
    const minute = Number(match[2] || 0);
    const meridiem = match[3] || "";
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }
  if (normalized.includes("morning")) return { hour: 9, minute: 0 };
  if (normalized.includes("afternoon")) return { hour: 14, minute: 0 };
  if (normalized.includes("evening")) return { hour: 18, minute: 0 };
  if (normalized.includes("night")) return { hour: 21, minute: 0 };
  return null;
}

function cloneDate(input: Date): Date {
  return new Date(input.getTime());
}

function readState(filePath: string): Promise<AutomationRuntimeState> {
  return fs
    .readFile(filePath, "utf8")
    .then((raw) => JSON.parse(raw) as Partial<AutomationRuntimeState>)
    .then((parsed) => ({
      ...DEFAULT_STATE,
      ...parsed,
      version: 1 as const,
      events: parsed.events && typeof parsed.events === "object" ? parsed.events : {},
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
      processState: toRecord(parsed.processState) ? (parsed.processState as AutomationRuntimeState["processState"]) : {},
    }))
    .catch(() => ({ ...DEFAULT_STATE, version: 1 as const }));
}

async function writeState(filePath: string, state: AutomationRuntimeState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

export function interpretAutomationSchedule(scheduleText: string, now = new Date(), lastTriggeredAt?: string): string | null {
  return computeNextScheduleOccurrence(scheduleText, now, lastTriggeredAt)?.toISOString() || null;
}

function computeNextScheduleOccurrence(scheduleText: string, now: Date, lastTriggeredAt?: string): Date | null {
  const normalized = compactWhitespace(scheduleText).toLowerCase();
  const reference = lastTriggeredAt ? new Date(lastTriggeredAt) : new Date(now.getTime());
  const base = Number.isFinite(reference.getTime()) ? reference : now;

  const everyMinutes = normalized.match(/\bevery\s+(\d+)\s+minute/);
  if (everyMinutes) {
    return new Date(base.getTime() + Number(everyMinutes[1] || 0) * 60_000);
  }
  const everyHours = normalized.match(/\bevery\s+(\d+)\s+hour/);
  if (everyHours) {
    return new Date(base.getTime() + Number(everyHours[1] || 0) * 60 * 60_000);
  }
  if (normalized === "hourly" || normalized.includes("every hour")) {
    return new Date(base.getTime() + 60 * 60_000);
  }
  if (normalized.includes("daily") || normalized.includes("every day")) {
    const time = parseNaturalLanguageHour(normalized) || { hour: 9, minute: 0 };
    const next = cloneDate(now);
    next.setHours(time.hour, time.minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (normalized.includes("weekday")) {
    const time = parseNaturalLanguageHour(normalized) || { hour: 9, minute: 0 };
    const next = cloneDate(now);
    next.setHours(time.hour, time.minute, 0, 0);
    while (next.getDay() === 0 || next.getDay() === 6 || next <= now) {
      next.setDate(next.getDate() + 1);
      next.setHours(time.hour, time.minute, 0, 0);
    }
    return next;
  }
  if (normalized.includes("weekend")) {
    const time = parseNaturalLanguageHour(normalized) || { hour: 10, minute: 0 };
    const next = cloneDate(now);
    next.setHours(time.hour, time.minute, 0, 0);
    while (![0, 6].includes(next.getDay()) || next <= now) {
      next.setDate(next.getDate() + 1);
      next.setHours(time.hour, time.minute, 0, 0);
    }
    return next;
  }

  const weekdayMap = new Map<string, number>([
    ["sunday", 0],
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
  ]);
  for (const [label, day] of weekdayMap.entries()) {
    if (!normalized.includes(label)) continue;
    const time = parseNaturalLanguageHour(normalized) || { hour: 9, minute: 0 };
    const next = cloneDate(now);
    next.setHours(time.hour, time.minute, 0, 0);
    while (next.getDay() !== day || next <= now) {
      next.setDate(next.getDate() + 1);
      next.setHours(time.hour, time.minute, 0, 0);
    }
    return next;
  }

  if (normalized.includes("morning") || normalized.includes("afternoon") || normalized.includes("evening")) {
    const time = parseNaturalLanguageHour(normalized) || { hour: 9, minute: 0 };
    const next = cloneDate(now);
    next.setHours(time.hour, time.minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  return new Date(base.getTime() + 60 * 60_000);
}

function shouldTriggerSchedule(scheduleText: string, now: Date, lastTriggeredAt?: string): boolean {
  if (!lastTriggeredAt) return true;
  const next = computeNextScheduleOccurrence(scheduleText, lastTriggeredAt ? new Date(lastTriggeredAt) : now, lastTriggeredAt);
  if (!next) return false;
  return next.getTime() <= now.getTime();
}

function pathMatchesFilters(
  relativePath: string,
  includes: string[] | undefined,
  excludes: string[] | undefined
): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (DEFAULT_FILE_IGNORE.some((pattern) => pattern.test(normalized))) return false;
  if (excludes?.some((entry) => normalized.includes(entry.toLowerCase()))) return false;
  if (!includes?.length) return true;
  return includes.some((entry) => normalized.includes(entry.toLowerCase()));
}

export function legacyAgentToAutomation(input: {
  id: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification";
  scheduleMinutes?: number;
  workspaceRoot?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
}): BinaryAutomationDefinition {
  const workspaceRoot =
    typeof input.workspaceRoot === "string" && input.workspaceRoot.trim()
      ? normalizePath(input.workspaceRoot)
      : undefined;
  let trigger: BinaryAutomationTrigger;
  if (input.trigger === "scheduled") {
    trigger = {
      kind: "schedule_nl",
      scheduleText: input.scheduleMinutes ? `every ${input.scheduleMinutes} minutes` : "every hour",
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
  } else if (input.trigger === "file_event") {
    trigger = {
      kind: "file_event",
      workspaceRoot: workspaceRoot || process.cwd(),
    };
  } else if (input.trigger === "process_event") {
    trigger = {
      kind: "process_event",
      query: input.name,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
  } else if (input.trigger === "notification") {
    trigger = {
      kind: "notification",
      ...(workspaceRoot ? { workspaceRoot } : {}),
      topic: input.name,
    };
  } else {
    trigger = {
      kind: "manual",
      ...(workspaceRoot ? { workspaceRoot } : {}),
    };
  }

  return {
    id: input.id,
    name: input.name,
    prompt: input.prompt,
    status: input.status,
    trigger,
    policy: "autonomous",
    workspaceRoot,
    model: input.model,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastRunAt: input.lastRunAt,
    deliveryHealth: "idle",
  };
}

export function automationToLegacyAgent(automation: BinaryAutomationDefinition): {
  id: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification";
  scheduleMinutes?: number;
  workspaceRoot?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
} {
  let trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification" = "manual";
  let scheduleMinutes: number | undefined;
  if (automation.trigger.kind === "schedule_nl") {
    trigger = "scheduled";
    const match = automation.trigger.scheduleText.match(/every\s+(\d+)\s+minutes?/i);
    scheduleMinutes = match ? Number(match[1] || 0) : undefined;
  } else if (automation.trigger.kind === "file_event") {
    trigger = "file_event";
  } else if (automation.trigger.kind === "process_event") {
    trigger = "process_event";
  } else if (automation.trigger.kind === "notification") {
    trigger = "notification";
  }
  return {
    id: automation.id,
    name: automation.name,
    prompt: automation.prompt,
    status: automation.status,
    trigger,
    ...(scheduleMinutes ? { scheduleMinutes } : {}),
    ...(automation.workspaceRoot ? { workspaceRoot: automation.workspaceRoot } : {}),
    ...(automation.model ? { model: automation.model } : {}),
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
    ...(automation.lastRunAt ? { lastRunAt: automation.lastRunAt } : {}),
  };
}

export class AutomationRuntime {
  private readonly fetchImpl: typeof fetch;
  private state: AutomationRuntimeState = { ...DEFAULT_STATE };
  private initialized = false;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private processTimer: NodeJS.Timeout | null = null;
  private deliveryTimer: NodeJS.Timeout | null = null;
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly fileDebounce = new Map<string, NodeJS.Timeout>();

  constructor(private readonly input: AutomationRuntimeInput) {
    this.fetchImpl = input.fetchImpl || fetch;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.state = await readState(this.input.storagePath);
    this.initialized = true;
    await this.syncFileWatchers();
  }

  async start(): Promise<void> {
    await this.initialize();
    if (!this.schedulerTimer) {
      this.schedulerTimer = setInterval(() => {
        void this.runSchedulerTick();
      }, SCHEDULER_INTERVAL_MS);
      this.schedulerTimer.unref?.();
    }
    if (!this.processTimer) {
      this.processTimer = setInterval(() => {
        void this.runProcessTick();
      }, PROCESS_POLL_MS);
      this.processTimer.unref?.();
    }
    if (!this.deliveryTimer) {
      this.deliveryTimer = setInterval(() => {
        void this.flushDeliveries();
      }, DELIVERY_POLL_MS);
      this.deliveryTimer.unref?.();
    }
  }

  async refreshConfig(): Promise<void> {
    await this.initialize();
    await this.syncFileWatchers();
  }

  async stop(): Promise<void> {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    if (this.processTimer) clearInterval(this.processTimer);
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    this.schedulerTimer = null;
    this.processTimer = null;
    this.deliveryTimer = null;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }

  async listAutomations(): Promise<BinaryAutomationDefinition[]> {
    await this.initialize();
    const config = await this.input.readConfig();
    const now = new Date();
    return config.automations.map((automation) => this.decorateAutomationForReturn(automation, now));
  }

  async getAutomation(id: string): Promise<BinaryAutomationDefinition | null> {
    const automations = await this.listAutomations();
    return automations.find((item) => item.id === id) || null;
  }

  async saveAutomation(
    raw: Partial<BinaryAutomationDefinition> & Pick<BinaryAutomationDefinition, "name" | "prompt" | "trigger">
  ): Promise<BinaryAutomationDefinition> {
    await this.initialize();
    const config = await this.input.readConfig();
    const now = nowIso();
    const existing = raw.id ? config.automations.find((item) => item.id === raw.id) : null;
    const trigger = this.normalizeTrigger(raw.trigger, raw.workspaceRoot || existing?.workspaceRoot);
    const automation: BinaryAutomationDefinition = {
      id: existing?.id || randomUUID(),
      name: compactWhitespace(raw.name),
      prompt: compactWhitespace(raw.prompt),
      status: raw.status === "paused" ? "paused" : existing?.status || "active",
      trigger,
      policy:
        raw.policy === "observe_only" || raw.policy === "approval_before_mutation"
          ? raw.policy
          : existing?.policy || "autonomous",
      workspaceRoot:
        typeof raw.workspaceRoot === "string" && raw.workspaceRoot.trim()
          ? normalizePath(raw.workspaceRoot)
          : existing?.workspaceRoot || triggerWorkspaceRoot(trigger),
      model:
        typeof raw.model === "string" && raw.model.trim()
          ? raw.model.trim()
          : existing?.model,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt,
      lastTriggerAt: existing?.lastTriggerAt,
      lastRunId: existing?.lastRunId,
      lastTriggerSummary: existing?.lastTriggerSummary,
      nextRunAt: existing?.nextRunAt,
      lastDeliveryAt: existing?.lastDeliveryAt,
      lastDeliveryError: existing?.lastDeliveryError,
      deliveryHealth: existing?.deliveryHealth || "idle",
    };

    const nextConfig: RuntimeConfig = {
      ...config,
      automations: [automation, ...config.automations.filter((item) => item.id !== automation.id)],
    };
    await this.input.writeConfig(nextConfig);
    await this.syncFileWatchers();
    await this.emitAutomationEvent({
      automation,
      eventName: existing ? "automation.updated" : "automation.created",
      data: { automation: this.decorateAutomationForReturn(automation, new Date()) },
      source: "automation_runtime",
      severity: "info",
      triggerKind: automation.trigger.kind,
    });
    return this.decorateAutomationForReturn(automation, new Date());
  }

  async controlAutomation(id: string, action: "pause" | "resume"): Promise<BinaryAutomationDefinition | null> {
    await this.initialize();
    const config = await this.input.readConfig();
    const existing = config.automations.find((item) => item.id === id);
    if (!existing) return null;
    const next: BinaryAutomationDefinition = {
      ...existing,
      status: action === "pause" ? "paused" : "active",
      updatedAt: nowIso(),
    };
    await this.input.writeConfig({
      ...config,
      automations: [next, ...config.automations.filter((item) => item.id !== id)],
    });
    await this.syncFileWatchers();
    await this.emitAutomationEvent({
      automation: next,
      eventName: action === "pause" ? "automation.paused" : "automation.updated",
      data: { automation: this.decorateAutomationForReturn(next, new Date()), action },
      source: "automation_runtime",
      severity: "info",
      triggerKind: next.trigger.kind,
    });
    return this.decorateAutomationForReturn(next, new Date());
  }

  async listWebhookSubscriptions(): Promise<BinaryWebhookSubscription[]> {
    const config = await this.input.readConfig();
    return config.webhookSubscriptions;
  }

  async saveWebhookSubscription(
    raw: Partial<BinaryWebhookSubscription> & Pick<BinaryWebhookSubscription, "url">
  ): Promise<BinaryWebhookSubscription> {
    await this.initialize();
    const config = await this.input.readConfig();
    const existing = raw.id ? config.webhookSubscriptions.find((item) => item.id === raw.id) : null;
    const now = nowIso();
    const next: BinaryWebhookSubscription = {
      id: existing?.id || randomUUID(),
      url: compactWhitespace(raw.url),
      status: raw.status === "paused" ? "paused" : "active",
      secret:
        typeof raw.secret === "string" && raw.secret.trim()
          ? raw.secret.trim()
          : existing?.secret || randomUUID().replace(/-/g, ""),
      automationId:
        typeof raw.automationId === "string" && raw.automationId.trim() ? raw.automationId.trim() : existing?.automationId,
      events: Array.isArray(raw.events)
        ? raw.events.map((item) => String(item)).filter(Boolean)
        : existing?.events,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastAttemptAt: existing?.lastAttemptAt,
      lastSuccessAt: existing?.lastSuccessAt,
      failureCount: existing?.failureCount || 0,
    };
    await this.input.writeConfig({
      ...config,
      webhookSubscriptions: [next, ...config.webhookSubscriptions.filter((item) => item.id !== next.id)],
    });
    return next;
  }

  async runAutomation(id: string, triggerSummary = "Manual automation run requested."): Promise<QueueRunResult | null> {
    await this.initialize();
    const automation = await this.getAutomation(id);
    if (!automation) return null;
    return await this.triggerAutomation(automation, {
      triggerKind: "manual",
      triggerSummary,
      source: "automation_runtime",
    });
  }

  async ingestNotification(input: {
    topic?: string;
    summary?: string;
    automationId?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ triggeredAutomationIds: string[] }> {
    await this.initialize();
    const config = await this.input.readConfig();
    const triggered: string[] = [];
    const topic = compactWhitespace(input.topic);
    const summary = compactWhitespace(input.summary);

    for (const automation of config.automations) {
      if (automation.status !== "active" || automation.trigger.kind !== "notification") continue;
      if (input.automationId && automation.id !== input.automationId) continue;
      const matchesTopic = !automation.trigger.topic || automation.trigger.topic === topic;
      const matchesQuery =
        !automation.trigger.query ||
        summary.toLowerCase().includes(automation.trigger.query.toLowerCase()) ||
        topic.toLowerCase().includes(automation.trigger.query.toLowerCase());
      if (!matchesTopic || !matchesQuery) continue;
      await this.triggerAutomation(automation, {
        triggerKind: "notification",
        triggerSummary: summary || topic || "Notification trigger received.",
        source: "notification",
        extraData: {
          topic,
          payload: input.payload || {},
        },
      });
      triggered.push(automation.id);
    }

    return { triggeredAutomationIds: triggered };
  }

  async getAutomationEvents(automationId: string, after = 0): Promise<{ automation: BinaryAutomationDefinition | null; events: StoredAutomationEvent[] }> {
    await this.initialize();
    const automation = await this.getAutomation(automationId);
    const events = (this.state.events[automationId] || []).filter((item) => item.seq > after);
    return { automation, events };
  }

  async recordRunStarted(input: { automationId: string; runId: string }): Promise<void> {
    const automation = await this.getAutomation(input.automationId);
    if (!automation) return;
    await this.emitAutomationEvent({
      automation,
      eventName: "automation.run_started",
      data: { runId: input.runId, automationId: automation.id },
      source: "host",
      severity: "info",
      triggerKind: automation.trigger.kind,
      runId: input.runId,
    });
  }

  async recordRunCompleted(input: { automationId: string; runId: string; summary?: string }): Promise<void> {
    await this.applyRunResult(input, "automation.run_completed", "info", input.summary);
  }

  async recordRunFailed(input: { automationId: string; runId: string; summary?: string }): Promise<void> {
    await this.applyRunResult(input, "automation.run_failed", "error", input.summary);
  }

  private async applyRunResult(
    input: { automationId: string; runId: string; summary?: string },
    eventName: string,
    severity: "info" | "warn" | "error",
    summary?: string
  ): Promise<void> {
    const config = await this.input.readConfig();
    const automation = config.automations.find((item) => item.id === input.automationId);
    if (!automation) return;
    const next: BinaryAutomationDefinition = {
      ...automation,
      lastRunAt: nowIso(),
      lastRunId: input.runId,
      updatedAt: nowIso(),
    };
    await this.input.writeConfig({
      ...config,
      automations: [next, ...config.automations.filter((item) => item.id !== next.id)],
    });
    await this.emitAutomationEvent({
      automation: next,
      eventName,
      data: { runId: input.runId, summary: summary || "", automationId: next.id },
      source: "host",
      severity,
      triggerKind: next.trigger.kind,
      runId: input.runId,
    });
  }

  private normalizeTrigger(trigger: BinaryAutomationTrigger, fallbackWorkspaceRoot?: string): BinaryAutomationTrigger {
    if (trigger.kind === "manual") {
      return {
        kind: "manual",
        ...(trigger.workspaceRoot || fallbackWorkspaceRoot
          ? { workspaceRoot: normalizePath(trigger.workspaceRoot || fallbackWorkspaceRoot || "") }
          : {}),
      };
    }
    if (trigger.kind === "schedule_nl") {
      return {
        kind: "schedule_nl",
        scheduleText: compactWhitespace(trigger.scheduleText),
        ...(trigger.workspaceRoot || fallbackWorkspaceRoot
          ? { workspaceRoot: normalizePath(trigger.workspaceRoot || fallbackWorkspaceRoot || "") }
          : {}),
      };
    }
    if (trigger.kind === "file_event") {
      return {
        kind: "file_event",
        workspaceRoot: normalizePath(trigger.workspaceRoot || fallbackWorkspaceRoot || ""),
        ...(trigger.includes?.length ? { includes: trigger.includes.map((item) => compactWhitespace(item)).filter(Boolean) } : {}),
        ...(trigger.excludes?.length ? { excludes: trigger.excludes.map((item) => compactWhitespace(item)).filter(Boolean) } : {}),
      };
    }
    if (trigger.kind === "process_event") {
      return {
        kind: "process_event",
        query: compactWhitespace(trigger.query),
        ...(trigger.workspaceRoot || fallbackWorkspaceRoot
          ? { workspaceRoot: normalizePath(trigger.workspaceRoot || fallbackWorkspaceRoot || "") }
          : {}),
      };
    }
    return {
      kind: "notification",
      ...(trigger.workspaceRoot || fallbackWorkspaceRoot
        ? { workspaceRoot: normalizePath(trigger.workspaceRoot || fallbackWorkspaceRoot || "") }
        : {}),
      ...(trigger.topic ? { topic: compactWhitespace(trigger.topic) } : {}),
      ...(trigger.query ? { query: compactWhitespace(trigger.query) } : {}),
    };
  }

  private decorateAutomationForReturn(automation: BinaryAutomationDefinition, now: Date): BinaryAutomationDefinition {
    if (automation.trigger.kind !== "schedule_nl") {
      return automation;
    }
    const nextRunAt = computeNextScheduleOccurrence(
      automation.trigger.scheduleText,
      now,
      automation.lastTriggerAt
    )?.toISOString();
    return {
      ...automation,
      nextRunAt,
    };
  }

  private async emitAutomationEvent(input: {
    automation: BinaryAutomationDefinition;
    eventName: string;
    data: Record<string, unknown>;
    source: "automation_runtime" | "scheduler" | "file_watch" | "process_watch" | "notification" | "host" | "webhook";
    severity: "info" | "warn" | "error";
    triggerKind: BinaryAutomationTriggerKind;
    runId?: string;
    skipWebhookDelivery?: boolean;
  }): Promise<string> {
    await this.initialize();
    const seq = ((this.state.events[input.automation.id] || []).at(-1)?.seq || 0) + 1;
    const capturedAt = nowIso();
    const payload = {
      event: input.eventName,
      data: input.data,
      id: `automation_event_${input.automation.id}_${seq}`,
      seq,
      capturedAt,
      scope: input.runId ? "run" : "automation",
      automationId: input.automation.id,
      ...(input.runId ? { runId: input.runId } : {}),
      triggerKind: input.triggerKind,
      source: input.source,
      severity: input.severity,
    };
    const stored: StoredAutomationEvent = {
      seq,
      capturedAt,
      event: payload,
    };
    this.state.events[input.automation.id] = [...(this.state.events[input.automation.id] || []), stored].slice(
      -MAX_AUTOMATION_EVENTS
    );
    if (!input.skipWebhookDelivery) {
      await this.enqueueDeliveries(payload);
    }
    await this.persistState();
    return String(payload.id);
  }

  private async enqueueDeliveries(payload: Record<string, unknown>): Promise<void> {
    const config = await this.input.readConfig();
    const eventName = String(payload.event || "");
    for (const subscription of config.webhookSubscriptions) {
      if (subscription.status !== "active") continue;
      if (subscription.automationId && subscription.automationId !== String(payload.automationId || "")) continue;
      if (!matchesEventFilter(eventName, subscription.events)) continue;
      this.state.deliveries.push({
        id: randomUUID(),
        subscriptionId: subscription.id,
        automationId: typeof payload.automationId === "string" ? payload.automationId : undefined,
        eventName,
        payload,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    this.state.deliveries = this.state.deliveries.slice(-MAX_DELIVERIES);
  }

  private async persistState(): Promise<void> {
    await writeState(this.input.storagePath, this.state);
  }

  private async triggerAutomation(
    automation: BinaryAutomationDefinition,
    input: {
      triggerKind: BinaryAutomationTriggerKind;
      triggerSummary: string;
      source: "automation_runtime" | "scheduler" | "file_watch" | "process_watch" | "notification";
      extraData?: Record<string, unknown>;
    }
  ): Promise<QueueRunResult> {
    const config = await this.input.readConfig();
    const current = config.automations.find((item) => item.id === automation.id) || automation;
    const next: BinaryAutomationDefinition = {
      ...current,
      lastTriggerAt: nowIso(),
      lastTriggerSummary: input.triggerSummary,
      updatedAt: nowIso(),
    };
    await this.input.writeConfig({
      ...config,
      automations: [next, ...config.automations.filter((item) => item.id !== next.id)],
    });
    const eventId = await this.emitAutomationEvent({
      automation: next,
      eventName: "automation.triggered",
      data: {
        automationId: next.id,
        summary: input.triggerSummary,
        ...(input.extraData || {}),
      },
      source: input.source,
      severity: "info",
      triggerKind: input.triggerKind,
    });
    const queued = await this.input.queueAutomationRun({
      automation: next,
      triggerSummary: input.triggerSummary,
      triggerKind: input.triggerKind,
      eventId,
      workspaceRoot: next.workspaceRoot || triggerWorkspaceRoot(next.trigger),
    });
    const updated: BinaryAutomationDefinition = {
      ...next,
      lastRunId: queued.id,
      updatedAt: nowIso(),
    };
    await this.input.writeConfig({
      ...config,
      automations: [updated, ...config.automations.filter((item) => item.id !== updated.id)],
    });
    await this.emitAutomationEvent({
      automation: updated,
      eventName: "automation.run_queued",
      data: {
        automationId: updated.id,
        runId: queued.id,
        summary: input.triggerSummary,
      },
      source: "host",
      severity: "info",
      triggerKind: input.triggerKind,
      runId: queued.id,
    });
    return queued;
  }

  private async runSchedulerTick(): Promise<void> {
    const config = await this.input.readConfig();
    const now = new Date();
    for (const automation of config.automations) {
      if (automation.status !== "active" || automation.trigger.kind !== "schedule_nl") continue;
      if (!shouldTriggerSchedule(automation.trigger.scheduleText, now, automation.lastTriggerAt)) continue;
      await this.triggerAutomation(automation, {
        triggerKind: "schedule_nl",
        triggerSummary: `Schedule matched: ${automation.trigger.scheduleText}`,
        source: "scheduler",
      });
    }
  }

  private async runProcessTick(): Promise<void> {
    const config = await this.input.readConfig();
    if (!config.automations.some((item) => item.status === "active" && item.trigger.kind === "process_event")) {
      return;
    }
    const snapshot = await this.input.getDesktopSnapshot().catch(
      () =>
        ({
          activeWindow: undefined,
        }) as Awaited<ReturnType<AutomationRuntimeInput["getDesktopSnapshot"]>>
    );
    const fingerprint = fingerprintActiveWindow(snapshot.activeWindow);
    if (!fingerprint || fingerprint === this.state.processState.lastFingerprint) return;
    this.state.processState.lastFingerprint = fingerprint;
    await this.persistState();
    for (const automation of config.automations) {
      if (automation.status !== "active" || automation.trigger.kind !== "process_event") continue;
      if (!fingerprint.includes(automation.trigger.query.toLowerCase())) continue;
      await this.triggerAutomation(automation, {
        triggerKind: "process_event",
        triggerSummary: `Process trigger matched ${automation.trigger.query}`,
        source: "process_watch",
        extraData: {
          activeWindow: snapshot.activeWindow || null,
        },
      });
    }
  }

  private async syncFileWatchers(): Promise<void> {
    const config = await this.input.readConfig();
    const roots = new Set<string>();
    for (const automation of config.automations) {
      if (automation.status !== "active" || automation.trigger.kind !== "file_event") continue;
      if (!config.trustedWorkspaceRoots.includes(normalizePath(automation.trigger.workspaceRoot))) continue;
      roots.add(normalizePath(automation.trigger.workspaceRoot));
    }

    for (const [root, watcher] of this.watchers.entries()) {
      if (roots.has(root)) continue;
      watcher.close();
      this.watchers.delete(root);
    }

    for (const root of roots) {
      if (this.watchers.has(root)) continue;
      try {
        const watcher = watch(
          root,
          { recursive: process.platform === "win32" },
          (eventType, filename) => {
            const relativePath = String(filename || "").trim();
            if (!relativePath) return;
            void this.handleFileChange(root, relativePath, eventType);
          }
        );
        this.watchers.set(root, watcher);
      } catch {
        continue;
      }
    }
  }

  private async handleFileChange(root: string, relativePath: string, eventType: string): Promise<void> {
    const config = await this.input.readConfig();
    for (const automation of config.automations) {
      if (automation.status !== "active" || automation.trigger.kind !== "file_event") continue;
      if (normalizePath(automation.trigger.workspaceRoot) !== normalizePath(root)) continue;
      if (!pathMatchesFilters(relativePath, automation.trigger.includes, automation.trigger.excludes)) continue;
      const key = `${automation.id}:${relativePath}`;
      const existing = this.fileDebounce.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.fileDebounce.delete(key);
        void this.triggerAutomation(automation, {
          triggerKind: "file_event",
          triggerSummary: `File ${eventType}: ${relativePath.replace(/\\/g, "/")}`,
          source: "file_watch",
          extraData: {
            relativePath: relativePath.replace(/\\/g, "/"),
            eventType,
          },
        });
      }, FILE_DEBOUNCE_MS);
      timer.unref?.();
      this.fileDebounce.set(key, timer);
    }
  }

  private async flushDeliveries(): Promise<void> {
    const config = await this.input.readConfig();
    const now = Date.now();
    const subscriptions = new Map(config.webhookSubscriptions.map((item) => [item.id, item]));
    const automations = new Map(config.automations.map((item) => [item.id, item]));
    let changed = false;

    for (const delivery of this.state.deliveries) {
      if (delivery.status === "delivered") continue;
      if (new Date(delivery.nextAttemptAt).getTime() > now) continue;
      const subscription = subscriptions.get(delivery.subscriptionId);
      if (!subscription || subscription.status !== "active") continue;

      delivery.attemptCount += 1;
      delivery.lastAttemptAt = nowIso();
      delivery.updatedAt = nowIso();
      changed = true;
      try {
        const payloadText = JSON.stringify(delivery.payload);
        const response = await this.fetchImpl(subscription.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Binary-Event": delivery.eventName,
            ...(subscription.secret
              ? { "X-Binary-Signature": encodeSignature(subscription.secret, payloadText) }
              : {}),
          },
          body: payloadText,
        });
        if (!response.ok) {
          throw new Error(`Webhook failed with status ${response.status}`);
        }
        delivery.status = "delivered";
        subscription.lastAttemptAt = delivery.lastAttemptAt;
        subscription.lastSuccessAt = delivery.lastAttemptAt;
        subscription.failureCount = 0;
        if (delivery.automationId) {
          const automation = automations.get(delivery.automationId);
          if (automation) {
            automations.set(delivery.automationId, {
              ...automation,
              lastDeliveryAt: delivery.lastAttemptAt,
              lastDeliveryError: undefined,
              deliveryHealth: "healthy",
              updatedAt: nowIso(),
            });
            await this.emitAutomationEvent({
              automation,
              eventName: "automation.webhook_delivered",
              data: {
                automationId: automation.id,
                subscriptionId: subscription.id,
                runEvent: delivery.eventName,
                deliveredAt: delivery.lastAttemptAt,
                attemptCount: delivery.attemptCount,
                url: subscription.url,
              },
              source: "webhook",
              severity: "info",
              triggerKind: automation.trigger.kind,
              skipWebhookDelivery: true,
            });
          }
        }
        changed = true;
      } catch (error) {
        delivery.lastError = error instanceof Error ? error.message : String(error);
        if (delivery.attemptCount >= DELIVERY_RETRY_LIMIT) {
          delivery.status = "failed";
        }
        delivery.nextAttemptAt = new Date(Date.now() + Math.min(60_000, 2 ** delivery.attemptCount * 1_000)).toISOString();
        subscription.lastAttemptAt = delivery.lastAttemptAt;
        subscription.failureCount = (subscription.failureCount || 0) + 1;
        if (delivery.automationId) {
          const automation = automations.get(delivery.automationId);
          if (automation) {
            automations.set(delivery.automationId, {
              ...automation,
              lastDeliveryError: delivery.lastError,
              deliveryHealth: "failing",
              updatedAt: nowIso(),
            });
            await this.emitAutomationEvent({
              automation,
              eventName: "automation.webhook_failed",
              data: {
                automationId: automation.id,
                subscriptionId: subscription.id,
                runEvent: delivery.eventName,
                attemptCount: delivery.attemptCount,
                error: delivery.lastError,
                nextAttemptAt: delivery.nextAttemptAt,
                url: subscription.url,
              },
              source: "webhook",
              severity: "error",
              triggerKind: automation.trigger.kind,
              skipWebhookDelivery: true,
            });
          }
        }
        changed = true;
      }
    }

    if (changed) {
      await this.input.writeConfig({
        ...config,
        automations: Array.from(automations.values()),
        webhookSubscriptions: Array.from(subscriptions.values()),
      });
      await this.persistState();
    }
  }
}
