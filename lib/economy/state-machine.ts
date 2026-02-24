export type JobStatus =
  | "POSTED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export type EscrowStatus =
  | "PENDING"
  | "FUNDED"
  | "RELEASED"
  | "REFUNDED"
  | "PARTIAL_RELEASE";

export type EconomyTransactionType = "PAYMENT" | "EARNINGS" | "FEE" | "REFUND";

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  POSTED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["REVIEW", "CANCELLED"],
  REVIEW: ["COMPLETED", "CANCELLED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: [],
};

export function canTransitionJobStatus(current: JobStatus, next: JobStatus): boolean {
  return JOB_TRANSITIONS[current]?.includes(next) ?? false;
}

export function assertJobTransition(current: JobStatus, next: JobStatus) {
  if (!canTransitionJobStatus(current, next)) {
    throw new Error(`INVALID_JOB_TRANSITION:${current}->${next}`);
  }
}