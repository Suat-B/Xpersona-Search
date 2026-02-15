/**
 * OpenClaw Tools API Router
 * Main entry point for all casino tool calls from AI agents
 */

import { NextRequest, NextResponse } from "next/server";
import { CasinoToolsSchema, CasinoToolName } from "@/lib/openclaw/tools-schema";
import { validateAgentToken, checkRateLimits, logToolCall, AgentContext } from "@/lib/openclaw/agent-auth";
import { executeTool } from "@/lib/openclaw/tool-executor";

export async function POST(request: NextRequest) {
  let body: { tool?: string; parameters?: unknown; agent_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", hint: "Send Content-Type: application/json with valid JSON: { tool, parameters }" },
      { status: 400 }
    );
  }

  try {
    
    // Validate request structure
    if (!body?.tool || body.parameters === undefined) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Invalid request: 'tool' and 'parameters' required",
          schema: { tool: "string", parameters: "object", agent_token: "string (optional)" },
          hint: "Example: {\"tool\":\"casino_get_balance\",\"parameters\":{}}"
        },
        { status: 400 }
      );
    }

    const { tool, parameters, agent_token } = body;

    // Validate tool exists
    if (!CasinoToolsSchema[tool as CasinoToolName]) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Unknown tool: ${tool}`,
          available_tools: Object.keys(CasinoToolsSchema)
        },
        { status: 400 }
      );
    }

    // Authenticate agent if token provided
    let agentContext: AgentContext | null = null;
    if (agent_token) {
      const authResult = await validateAgentToken(agent_token);
      if (!authResult.valid) {
        return NextResponse.json(
          { success: false, error: authResult.error },
          { status: 401 }
        );
      }
      agentContext = authResult.context || null;
    }

    // Check rate limits
    const rateLimitResult = await checkRateLimits(tool as CasinoToolName, agentContext);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Rate limit exceeded",
          retry_after: rateLimitResult.retryAfter
        },
        { status: 429 }
      );
    }

    // Log tool call
    await logToolCall(tool as CasinoToolName, parameters, agentContext);

    // Execute tool
    const result = await executeTool(
      tool as CasinoToolName, 
      parameters, 
      agentContext,
      request
    );

    return NextResponse.json({
      success: true,
      tool,
      result,
      meta: {
        timestamp: new Date().toISOString(),
        agent_id: agentContext?.agentId || null,
        rate_limit_remaining: rateLimitResult.remaining
      }
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error("Internal server error");
    console.error("OpenClaw tool execution error:", err.message);
    const isValidation = ["VALIDATION_ERROR", "Invalid", "required", "must be"].some(
      (s) => err.message.includes(s)
    );
    const status = isValidation ? 400 : 500;
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        hint: isValidation
          ? "Check parameters: amount/target as numbers, condition as 'over'|'under'. For strategies use name, baseConfig { amount, target, condition }, rules [{ trigger: { type }, action: { type } }]."
          : undefined,
        timestamp: new Date().toISOString(),
      },
      { status }
    );
  }
}

// GET endpoint for tool discovery
export async function GET() {
  return NextResponse.json({
    success: true,
    tools: CasinoToolsSchema,
    meta: {
      version: "1.0.0",
      casino: "xpersona",
      ai_first: true,
      description: "AI-first probability game with OpenClaw-native tools"
    }
  });
}
