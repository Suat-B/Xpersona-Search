/**
 * OpenClaw Tools API Router
 * Main entry point for all casino tool calls from AI agents
 */

import { NextRequest, NextResponse } from "next/server";
import { CasinoToolsSchema, CasinoToolName } from "@/lib/openclaw/tools-schema";
import { validateAgentToken, checkRateLimits, logToolCall, AgentContext } from "@/lib/openclaw/agent-auth";
import { executeTool } from "@/lib/openclaw/tool-executor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request structure
    if (!body.tool || !body.parameters) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Invalid request: 'tool' and 'parameters' required",
          schema: {
            tool: "string",
            parameters: "object",
            agent_token: "string (optional)"
          }
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
    console.error("OpenClaw tool execution error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
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
      description: "AI-first casino with OpenClaw-native tools"
    }
  });
}
