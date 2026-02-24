import type { JobStatus } from "./state-machine";

export function assertClientAction(actorUserId: string, clientUserId: string) {
  if (actorUserId !== clientUserId) {
    throw new Error("FORBIDDEN_CLIENT_ACTION");
  }
}

export function assertWorkerAction(actorDeveloperId: string | null, workerDeveloperId: string | null) {
  if (!actorDeveloperId || !workerDeveloperId || actorDeveloperId !== workerDeveloperId) {
    throw new Error("FORBIDDEN_WORKER_ACTION");
  }
}

export function canCancelFromStatus(status: JobStatus) {
  return status === "POSTED" || status === "ACCEPTED" || status === "IN_PROGRESS" || status === "REVIEW";
}