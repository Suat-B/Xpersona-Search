/**
 * HuggingFace Router - OpenAI-compatible Chat Completions API
 * 
 * POST /api/v1/hf/chat/completions
 * 
 * This endpoint proxies requests to HuggingFace Inference API while enforcing
 * rate limits based on the user's playground subscription tier.
 * 
 * Authentication: X-API-Key header with user's Xpersona API key
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hfUsageLogs } from "@/lib/db/playground-schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { 
  checkRateLimits, 
  getUserPlan,
  incrementUsage, 
  estimateMessagesTokens,
  PLAN_LIMITS
} from "@/lib/hf-router/rate-limit";

const HF_ROUTER_BASE_URL = "https://router.huggingface.co/v1";
const UNLIMITED_PLAYGROUND_EMAILS = new Set([
  "suat.bastug@icloud.com",
  "kiraaimoto@gmail.com",
]);

function getHfRouterToken(): string | undefined {
  return process.env.HF_ROUTER_TOKEN || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Authenticate request using X-API-Key header
 */
async function authenticateRequest(
  request: NextRequest
): Promise<{ userId: string; email: string; apiKeyPrefix: string } | null> {
  const apiKey = request.headers.get("X-API-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
  
  if (!apiKey) {
    return null;
  }

  // Hash the API key to look it up
  const crypto = require("crypto");
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      apiKeyPrefix: users.apiKeyPrefix,
    })
    .from(users)
    .where(eq(users.apiKeyHash, apiKeyHash))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return { 
    userId: user[0].id, 
    email: user[0].email,
    apiKeyPrefix: user[0].apiKeyPrefix || "unknown" 
  };
}

function hasUnlimitedPlaygroundAccess(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return isAdminEmail(normalized) || UNLIMITED_PLAYGROUND_EMAILS.has(normalized);
}

/**
 * Log usage to database
 */
async function logUsage(params: {
  userId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  status: "success" | "error" | "rate_limited" | "quota_exceeded" | "validation_error";
  errorMessage?: string;
  estimatedCostUsd: number;
  requestPayload: Record<string, unknown>;
}) {
  try {
    await db.insert(hfUsageLogs).values({
      userId: params.userId,
      model: params.model,
      provider: "nscale", // Default provider, can be extended
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      latencyMs: params.latencyMs,
      status: params.status,
      errorMessage: params.errorMessage,
      estimatedCostUsd: params.estimatedCostUsd,
      requestPayload: params.requestPayload,
    });
  } catch (error) {
    console.error("Failed to log HF usage:", error);
    // Don't throw - logging should not break the request
  }
}

/**
 * Calculate estimated cost based on token usage
 * HF Inference pricing: approximately $0.0001-0.001 per 1K tokens depending on model
 */
function calculateEstimatedCost(tokensInput: number, tokensOutput: number): number {
  // Conservative estimate: $0.0005 per 1K tokens (input + output)
  const totalTokens = tokensInput + tokensOutput;
  return (totalTokens / 1000) * 0.0005;
}

/**
 * Handle streaming response from HF
 */
async function handleStreamingResponse(
  hfResponse: Response,
  userId: string,
  requestBody: ChatCompletionRequest,
  startTime: number,
  estimatedInputTokens: number
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  let outputTokens = 0;
  let buffer = "";
  
  // Process the stream
  const reader = hfResponse.body?.getReader();
  if (!reader) {
    return new Response("No response body", { status: 500 });
  }

  // Process stream in background
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode and process chunks
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;
        
        // Count approximate tokens in output (rough estimate)
        // Each chunk might contain partial data, so we count when we see complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // Rough token estimate: 4 chars per token
                outputTokens += Math.max(1, Math.ceil(content.length / 4));
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
        
        // Forward chunk to client
        await writer.write(value);
      }
      
      // Write any remaining buffer
      if (buffer) {
        await writer.write(encoder.encode(buffer));
      }
      
      await writer.close();
      
      // Log usage after stream completes
      const latencyMs = Date.now() - startTime;
      const estimatedCost = calculateEstimatedCost(estimatedInputTokens, outputTokens);
      
      await Promise.all([
        logUsage({
          userId,
          model: requestBody.model,
          tokensInput: estimatedInputTokens,
          tokensOutput: outputTokens,
          latencyMs,
          status: "success",
          estimatedCostUsd: estimatedCost,
          requestPayload: { ...(requestBody as unknown as Record<string, unknown>), stream: true },
        }),
        incrementUsage(userId, estimatedInputTokens, outputTokens, estimatedCost),
      ]);
      
    } catch (error) {
      console.error("Error processing stream:", error);
      await writer.abort(error);
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Handle non-streaming response from HF
 */
async function handleNonStreamingResponse(
  hfResponse: Response,
  userId: string,
  requestBody: ChatCompletionRequest,
  startTime: number,
  estimatedInputTokens: number
): Promise<Response> {
  const latencyMs = Date.now() - startTime;
  
  if (!hfResponse.ok) {
    const errorText = await hfResponse.text();
    
    await logUsage({
      userId,
      model: requestBody.model,
      tokensInput: estimatedInputTokens,
      tokensOutput: 0,
      latencyMs,
      status: "error",
      errorMessage: `HF API error: ${hfResponse.status} - ${errorText}`,
      estimatedCostUsd: 0,
      requestPayload: requestBody as unknown as Record<string, unknown>,
    });
    
    return NextResponse.json(
      { error: "HF API error", message: errorText },
      { status: hfResponse.status }
    );
  }

  const data = await hfResponse.json();
  
  // Extract token usage from response if available, otherwise estimate
  const tokensOutput = data.usage?.completion_tokens ?? 
    Math.ceil((data.choices?.[0]?.message?.content?.length || 0) / 4);
  
  const estimatedCost = calculateEstimatedCost(estimatedInputTokens, tokensOutput);
  
  // Log usage asynchronously
  Promise.all([
    logUsage({
      userId,
      model: requestBody.model,
      tokensInput: estimatedInputTokens,
      tokensOutput,
      latencyMs,
      status: "success",
      estimatedCostUsd: estimatedCost,
      requestPayload: requestBody as unknown as Record<string, unknown>,
    }),
    incrementUsage(userId, estimatedInputTokens, tokensOutput, estimatedCost),
  ]).catch(console.error);
  
  return NextResponse.json(data);
}

/**
 * POST handler for chat completions
 */
export async function POST(request: NextRequest): Promise<Response> {
  const startTime = Date.now();
  const hfToken = getHfRouterToken();
  
  // Check HF token is configured
  if (!hfToken) {
    return NextResponse.json(
      {
        error: "HF router not configured",
        message:
          "Set HF_ROUTER_TOKEN (preferred), or HF_TOKEN, or HUGGINGFACE_TOKEN in .env.local and restart the Next.js server.",
      },
      { status: 500 }
    );
  }
  
  // Authenticate
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing API key" },
      { status: 401 }
    );
  }
  
  const { userId, email } = auth;
  const unlimitedAccess = hasUnlimitedPlaygroundAccess(email);

  // Explicit guard: only users with an active Playground subscription (trial/paid) can use HF routes.
  if (!unlimitedAccess) {
    const plan = await getUserPlan(userId);
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        {
          error: "PLAYGROUND_SUBSCRIPTION_REQUIRED",
          message: "Playground subscription required. Free dashboard plan keys cannot access Playground API endpoints.",
        },
        { status: 402 }
      );
    }
  }
  
  // Parse request body
  let body: ChatCompletionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  
  // Validate required fields
  if (!body.model || !body.messages || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "Missing required fields: model, messages" },
      { status: 400 }
    );
  }
  
  // Estimate input tokens
  const estimatedInputTokens = estimateMessagesTokens(body.messages);
  const requestedMaxTokens = body.max_tokens || 256;
  
  // Check rate limits
  let maxTokensForUpstream = requestedMaxTokens;
  if (!unlimitedAccess) {
    const rateLimitCheck = await checkRateLimits(userId, requestedMaxTokens, estimatedInputTokens);
    if (!rateLimitCheck.allowed) {
      // Log the rate limit violation
      await logUsage({
        userId,
        model: body.model,
        tokensInput: estimatedInputTokens,
        tokensOutput: 0,
        latencyMs: Date.now() - startTime,
        status: rateLimitCheck.reason?.includes("quota") ? "quota_exceeded" : "rate_limited",
        errorMessage: rateLimitCheck.reason,
        estimatedCostUsd: 0,
        requestPayload: body as unknown as Record<string, unknown>,
      });

      // Return appropriate status code
      const status = rateLimitCheck.reason?.includes("subscription") ? 402 : 429;
      return NextResponse.json(
        {
          error: status === 402 ? "Payment Required" : "Rate Limit Exceeded",
          message: rateLimitCheck.reason,
          usage: rateLimitCheck.currentUsage,
          limits: rateLimitCheck.limits,
        },
        { status }
      );
    }
    maxTokensForUpstream = Math.min(
      requestedMaxTokens,
      rateLimitCheck.limits?.maxOutputTokens || PLAN_LIMITS.paid.maxOutputTokens
    );
  }
  
  // Forward to HuggingFace
  try {
    const hfResponse = await fetch(`${HF_ROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        stream: body.stream ?? false,
        max_tokens: maxTokensForUpstream,
        temperature: body.temperature,
        top_p: body.top_p,
        frequency_penalty: body.frequency_penalty,
        presence_penalty: body.presence_penalty,
      }),
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      const errorMessage = errorText?.trim() || `Upstream HF error (${hfResponse.status})`;

      await logUsage({
        userId,
        model: body.model,
        tokensInput: estimatedInputTokens,
        tokensOutput: 0,
        latencyMs: Date.now() - startTime,
        status: "error",
        errorMessage: `HF API error: ${hfResponse.status} - ${errorMessage}`,
        estimatedCostUsd: 0,
        requestPayload: body as unknown as Record<string, unknown>,
      });

      return NextResponse.json(
        { error: "HF API error", message: errorMessage },
        { status: hfResponse.status }
      );
    }
    
    // Handle streaming vs non-streaming
    if (body.stream) {
      return handleStreamingResponse(hfResponse, userId, body, startTime, estimatedInputTokens);
    } else {
      return handleNonStreamingResponse(hfResponse, userId, body, startTime, estimatedInputTokens);
    }
    
  } catch (error) {
    console.error("HF Router error:", error);
    
    await logUsage({
      userId,
      model: body.model,
      tokensInput: estimatedInputTokens,
      tokensOutput: 0,
      latencyMs: Date.now() - startTime,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      estimatedCostUsd: 0,
      requestPayload: body as unknown as Record<string, unknown>,
    });
    
    return NextResponse.json(
      { error: "Internal server error", message: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * GET handler - not supported
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
