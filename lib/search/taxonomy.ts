export const TASK_TYPES = [
  "general",
  "automation",
  "retrieval",
  "coding",
  "analysis",
  "research",
  "support",
  "orchestration",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const FAILURE_CODES = [
  "timeout",
  "auth",
  "rate_limit",
  "tool_error",
  "schema_mismatch",
  "network",
  "unknown",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export const EXECUTION_PATHS = ["single", "delegated", "bundled"] as const;

export type ExecutionPath = (typeof EXECUTION_PATHS)[number];

