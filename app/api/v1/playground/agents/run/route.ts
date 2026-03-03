import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { runAssist } from "@/lib/playground/orchestration";
import { logAgentRun } from "@/lib/playground/store";
import { zAgentsRunRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundApiKey(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zAgentsRunRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const roles: Array<"planner" | "implementer" | "reviewer"> =
    body.roles?.length ? body.roles : ["planner", "implementer", "reviewer"];
  const sessionId = body.sessionId ?? crypto.randomUUID();

  const roleMode = (role: "planner" | "implementer" | "reviewer") =>
    role === "planner" ? "plan" : role === "reviewer" ? "debug" : "generate";

  const runs = await Promise.all(
    roles.map(async (role) => {
      const startedId = await logAgentRun({
        userId: auth.userId,
        sessionId,
        role,
        status: "running",
        payload: { task: body.task, role },
      });
      const result = await runAssist({
        mode: roleMode(role),
        task: `${body.task}\n\nAgent role: ${role}`,
        model: body.model,
        context: body.context as any,
        stream: false,
        max_tokens: 512,
      });
      await logAgentRun({
        userId: auth.userId,
        sessionId,
        role,
        status: "completed",
        confidence: result.confidence,
        riskLevel: result.risk.blastRadius,
        payload: { runId: startedId, decision: result.decision, model: result.modelUsed },
      });
      return {
        role,
        output: result.final,
        confidence: result.confidence,
        risk: result.risk,
      };
    })
  );

  const merged = [
    "Parallel agent synthesis:",
    ...runs.map((run) => `\n[${run.role.toUpperCase()}]\n${run.output}`),
  ].join("\n");

  return ok(request, {
    sessionId,
    runs,
    ...(process.env.PLAYGROUND_ENABLE_AGENT_ROUNDTABLE === "1"
      ? {
          roundtable: {
            planner: runs.find((run) => run.role === "planner")?.output ?? "",
            implementer: runs.find((run) => run.role === "implementer")?.output ?? "",
            reviewer: runs.find((run) => run.role === "reviewer")?.output ?? "",
          },
        }
      : {}),
    final: merged,
    unresolvedRisks: ["Reviewer output should be validated against actual test execution."],
  });
}
