/**
 * When true, the playground tool loop forwards tool traces/results to the OpenHands gateway only,
 * without Xpersona-authored stall/repair/mutation gates (see tool-loop.ts).
 */
export function isOpenHandsPrimaryOrchestration(): boolean {
  const v = String(process.env.PLAYGROUND_OPENHANDS_PRIMARY_ORCHESTRATION || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}
