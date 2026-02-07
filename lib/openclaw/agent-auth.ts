/**
 * Agent Authentication & Rate Limiting
 * For AI agents using OpenClaw tools
 */

export interface AgentContext {
  agentId: string;
  userId: string;
  permissions: string[];
  isAgent: boolean;
  maxBetAmount: number;
  createdAt: Date;
}

interface AuthResult {
  valid: boolean;
  context?: AgentContext;
  error?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

// Simple in-memory rate limiting for MVP
// In production, use Redis
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export async function validateAgentToken(token: string): Promise<AuthResult> {
  try {
    // Decode token (JWT-like structure)
    // Format: agent_id:user_id:permissions:signature
    const parts = token.split(":");
    
    if (parts.length < 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const [agentId, userId, permissionsStr] = parts;
    
    // In production, verify signature here
    // For now, accept valid format tokens
    
    const permissions = permissionsStr ? permissionsStr.split(",") : [];
    
    // Get user from database to verify
    // For now, create agent context
    const context: AgentContext = {
      agentId,
      userId,
      permissions,
      isAgent: true,
      maxBetAmount: 100, // Default max bet for agents
      createdAt: new Date()
    };

    return { valid: true, context };
  } catch (error) {
    return { valid: false, error: "Token validation failed" };
  }
}

export async function checkRateLimits(
  tool: string,
  agentContext: AgentContext | null
): Promise<RateLimitResult> {
  const key = agentContext 
    ? `rate_limit:${agentContext.agentId}:${tool}`
    : `rate_limit:guest:${tool}`;
  
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = agentContext ? 60 : 10; // 60/min for agents, 10/min for guests
  
  let record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
  }
  
  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    };
  }
  
  record.count++;
  rateLimitStore.set(key, record);
  
  return {
    allowed: true,
    remaining: maxRequests - record.count
  };
}

export async function logToolCall(
  tool: string,
  parameters: any,
  agentContext: AgentContext | null
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    tool,
    parameters: JSON.stringify(parameters).slice(0, 1000), // Limit size
    agent_id: agentContext?.agentId || null,
    user_id: agentContext?.userId || null
  };
  
  // In production, write to database or logging service
  console.log("[OpenClaw Tool Call]", logEntry);
}

// Generate agent token (for admin use)
export function generateAgentToken(
  agentId: string,
  userId: string,
  permissions: string[]
): string {
  // Simple token format: agent_id:user_id:permissions
  // In production, use proper JWT with signing
  return `${agentId}:${userId}:${permissions.join(",")}`;
}
