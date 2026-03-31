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
      version: 1,
      events: parsed.events && typeof parsed.events === "object" ? parsed.events : {},
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
      processState: toRecord(parsed.processState) ? (parsed.processState as AutomationRuntimeState["processState"]) : {},
    }))
    .catch(() => ({ ...DEFAULT_STATE }));
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
