/**
 * Optional routing of playground assist branches through OpenHands (startAssistToolLoop)
 * instead of direct runAssist / callDefaultModel. See docs/cutie-openhands-orchestration.md.
 */

function envFlagTrue(name: string): boolean {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/** When true and OPENHANDS_GATEWAY_URL is set, trivial greetings use the tool loop + gateway. */
export function isPlaygroundAssistGreetingViaGateway(): boolean {
  return envFlagTrue("PLAYGROUND_ASSIST_GREETING_VIA_GATEWAY");
}

/** When true and OPENHANDS_GATEWAY_URL is set, plan mode uses the tool loop + gateway. */
export function isPlaygroundAssistPlanViaGateway(): boolean {
  return envFlagTrue("PLAYGROUND_ASSIST_PLAN_VIA_GATEWAY");
}
