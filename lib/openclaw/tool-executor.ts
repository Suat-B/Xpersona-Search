/**
 * Tool Executor
 * Executes OpenClaw casino tools
 */

import { NextRequest } from "next/server";
import { CasinoToolName } from "./tools-schema";
import { AgentContext } from "./agent-auth";
import { getAuthUser } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { gameBets, users, strategies, agentSessions, creditPackages } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { DICE_HOUSE_EDGE, FAUCET_AMOUNT } from "@/lib/constants";
import { executeDiceRound } from "@/lib/games/execute-dice";
import { executePlinkoRound } from "@/lib/games/execute-plinko";
import { executeSlotsRound } from "@/lib/games/execute-slots";
import type { PlinkoRisk } from "@/lib/games/plinko";
import { grantFaucet } from "@/lib/faucet";
import Stripe from "stripe";

// Tool handler registry
const toolHandlers: Record<CasinoToolName, (params: any, agentContext: AgentContext | null, request: NextRequest) => Promise<any>> = {
  "casino_auth_guest": handleAuthGuest,
  "casino_auth_agent": handleAuthAgent,
  "casino_place_dice_bet": handlePlaceDiceBet,
  "casino_get_balance": handleGetBalance,
  "casino_get_history": handleGetHistory,
  "casino_analyze_patterns": handleAnalyzePatterns,
  "casino_run_strategy": handleRunStrategy,
  "casino_list_strategies": handleListStrategies,
  "casino_get_strategy": handleGetStrategy,
  "casino_delete_strategy": handleDeleteStrategy,
  "casino_stop_session": handleStopSession,
  "casino_get_session_status": handleGetSessionStatus,
  "casino_notify": handleNotify,
  "casino_get_limits": handleGetLimits,
  "casino_calculate_odds": handleCalculateOdds,
  "casino_claim_faucet": handleClaimFaucet,
  "casino_list_credit_packages": handleListCreditPackages,
  "casino_create_checkout": handleCreateCheckout
};

export async function executeTool(
  tool: CasinoToolName,
  parameters: any,
  agentContext: AgentContext | null,
  request: NextRequest
): Promise<any> {
  const handler = toolHandlers[tool];
  if (!handler) {
    throw new Error(`Tool handler not found: ${tool}`);
  }
  
  return await handler(parameters, agentContext, request);
}

// Tool Implementations

async function handleAuthGuest(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { action, guest_token } = params;
  
  if (action === "create") {
    // Create new guest user
    const userId = crypto.randomUUID();
    const token = `guest_${userId}_${Date.now()}`;
    
    // Create user in database
    await db.insert(users).values({
      id: userId,
      email: `guest_${userId}@xpersona.local`,
      name: `Guest_${userId.slice(0, 8)}`,
      credits: 1000,
      createdAt: new Date()
    });
    
    return {
      success: true,
      guest_token: token,
      user_id: userId,
      message: "Guest account created successfully",
      starting_credits: 1000
    };
  }
  
  if (action === "login" && guest_token) {
    return {
      success: true,
      guest_token,
      message: "Logged in successfully"
    };
  }
  
  throw new Error("Invalid auth action");
}

async function handleAuthAgent(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { agent_id, agent_token, permissions } = params;
  
  const sessionToken = `agent_${agent_id}_${Date.now()}`;
  
  // Note: In production, validate agent_token properly
  await db.insert(agentSessions).values({
    id: crypto.randomUUID(),
    agentId: agent_id,
    userId: "system", // Should get from auth
    token: sessionToken,
    permissions: permissions || ["bet", "strategy", "read"],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  
  return {
    success: true,
    session_token: sessionToken,
    permissions: permissions || ["bet", "strategy", "read"],
    rate_limits: {
      max_bets_per_second: 1,
      max_bets_per_hour: 1000,
      max_bet_amount: 100
    }
  };
}

async function handlePlaceDiceBet(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { amount, target, condition, strategy_id } = params;

  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }

  const user = authResult.user;

  if (amount < 1 || amount > 10000) {
    throw new Error("Invalid bet amount");
  }

  if (target < 0 || target > 99.99) {
    throw new Error("Invalid target");
  }

  if (!["over", "under"].includes(condition)) {
    throw new Error("Invalid condition");
  }

  if (user.credits < amount) {
    throw new Error("Insufficient balance");
  }

  if (agentContext && amount > agentContext.maxBetAmount) {
    throw new Error(`Agent bet limit exceeded: max ${agentContext.maxBetAmount}`);
  }

  const resultPayloadExtra: Record<string, unknown> = {};
  if (strategy_id != null) resultPayloadExtra.strategy_id = strategy_id;
  if (agentContext?.agentId != null) resultPayloadExtra.agent_id = agentContext.agentId;

  const round = await executeDiceRound(
    user.id,
    amount,
    target,
    condition as "over" | "under",
    Object.keys(resultPayloadExtra).length > 0 ? resultPayloadExtra : undefined
  );

  return {
    success: true,
    result: round.result,
    win: round.win,
    payout: round.payout,
    balance: round.balance,
    server_seed_hash: round.serverSeedHash ?? "",
    nonce: 0,
  };
}

async function handleGetBalance(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }
  
  const user = authResult.user;
  
  const recentBets = await db.query.gameBets.findMany({
    where: eq(gameBets.userId, user.id),
    orderBy: desc(gameBets.createdAt),
    limit: 100
  });
  
  const totalRounds = recentBets.length;
  const wins = recentBets.filter(b => b.outcome === "win").length;
  const winRate = totalRounds > 0 ? (wins / totalRounds) * 100 : 0;
  const sessionPnl = recentBets.reduce((sum, b) => sum + (b.payout - b.amount), 0);
  
  return {
    balance: user.credits,
    initial_balance: 1000,
    session_pnl: sessionPnl,
    total_rounds: totalRounds,
    win_rate: winRate,
    current_streak: calculateStreak(recentBets),
    best_streak: calculateBestStreak(recentBets)
  };
}

async function handleGetHistory(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { limit = 50, offset = 0, game_type = "dice" } = params;
  
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }
  
  const user = authResult.user;
  
  const bets = await db.query.gameBets.findMany({
    where: and(
      eq(gameBets.userId, user.id),
      eq(gameBets.gameType, game_type)
    ),
    orderBy: desc(gameBets.createdAt),
    limit,
    offset
  });
  
  const totalBets = bets.length;
  const totalWins = bets.filter(b => b.outcome === "win").length;
  const totalLosses = totalBets - totalWins;
  const avgBet = totalBets > 0 ? bets.reduce((sum, b) => sum + b.amount, 0) / totalBets : 0;
  const bestWin = Math.max(...bets.map(b => b.outcome === "win" ? b.payout - b.amount : 0), 0);
  const worstLoss = Math.min(...bets.map(b => b.outcome === "loss" ? -b.amount : 0), 0);
  
  return {
    history: bets.map((bet, idx) => ({
      round: totalBets - idx,
      result: (bet.resultPayload as any)?.result || 0,
      win: bet.outcome === "win",
      payout: bet.payout,
      bet_amount: bet.amount,
      timestamp: bet.createdAt?.toISOString() || new Date().toISOString()
    })),
    statistics: {
      total_bets: totalBets,
      total_wins: totalWins,
      total_losses: totalLosses,
      avg_bet: avgBet,
      best_win: bestWin,
      worst_loss: worstLoss,
      profit_factor: totalLosses > 0 ? (totalWins * avgBet) / (totalLosses * avgBet) : 0,
      expected_value: totalBets > 0 ? bets.reduce((sum, b) => sum + (b.payout - b.amount), 0) / totalBets : 0
    }
  };
}

async function handleAnalyzePatterns(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { lookback_rounds = 100, analysis_type = "distribution" } = params;
  
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }
  
  const user = authResult.user;
  
  const bets = await db.query.gameBets.findMany({
    where: eq(gameBets.userId, user.id),
    orderBy: desc(gameBets.createdAt),
    limit: lookback_rounds
  });
  
  const results = bets.map(b => (b.resultPayload as any)?.result || 0);
  
  const distribution = {
    "0-16": results.filter(r => r <= 16).length,
    "17-33": results.filter(r => r > 16 && r <= 33).length,
    "34-50": results.filter(r => r > 33 && r <= 50).length,
    "51-66": results.filter(r => r > 50 && r <= 66).length,
    "67-83": results.filter(r => r > 66 && r <= 83).length,
    "84-100": results.filter(r => r > 83).length
  };
  
  const hotNumbers = results.slice(0, 20).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  
  return {
    analysis: {
      distribution,
      hot_numbers: hotNumbers,
      cold_numbers: [],
      current_streak_type: calculateStreak(bets) > 0 ? "win" : "loss",
      recommended_target: 50,
      confidence: 0.5
    }
  };
}

async function handleRunStrategy(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { strategy_id, config: inlineConfig, max_rounds = 20 } = params;

  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }
  const user = authResult.user;

  if (!strategy_id && !inlineConfig) {
    throw new Error("strategy_id or config (amount, target, condition) required");
  }

  const configForApi =
    inlineConfig && typeof inlineConfig === "object"
      ? {
          amount: inlineConfig.amount,
          target: inlineConfig.target,
          condition: inlineConfig.condition,
          progressionType: inlineConfig.progression_type ?? inlineConfig.progressionType,
          maxBet: inlineConfig.max_bet ?? inlineConfig.maxBet,
          maxConsecutiveLosses: inlineConfig.max_consecutive_losses ?? inlineConfig.maxConsecutiveLosses,
          maxConsecutiveWins: inlineConfig.max_consecutive_wins ?? inlineConfig.maxConsecutiveWins,
        }
      : undefined;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const res = await fetch(`${baseUrl}/api/games/dice/run-strategy`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...(strategy_id ? { strategyId: strategy_id } : { config: configForApi }),
      maxRounds: Math.min(100, Math.max(1, max_rounds ?? 20)),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? data.message ?? "Run strategy failed");
  }
  const d = data.data ?? {};
  return {
    success: true,
    session_id: crypto.randomUUID(),
    status: "completed",
    total_rounds: d.roundsPlayed ?? 0,
    final_balance: d.finalBalance ?? user.credits,
    session_pnl: d.sessionPnl ?? 0,
    stopped_reason: d.stoppedReason ?? "max_rounds",
    results: d.results ?? [],
  };
}

async function handleListStrategies(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { game_type, include_public = false } = params;
  
  const authResult = await getAuthUser(request);
  if ("error" in authResult) {
    throw new Error(authResult.error);
  }
  
  const user = authResult.user;
  
  const userStrategies = await db.query.strategies.findMany({
    where: eq(strategies.userId, user.id)
  });
  
  return {
    strategies: userStrategies.map(s => ({
      id: s.id,
      name: s.name,
      description: "",
      game_type: s.gameType,
      created_at: s.createdAt?.toISOString() || new Date().toISOString(),
      times_run: 0,
      avg_pnl: 0,
      win_rate: 0,
      is_public: false,
      tags: []
    }))
  };
}

async function handleGetStrategy(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { strategy_id } = params;

  const authResult = await getAuthUser(request);
  if ("error" in authResult) throw new Error(authResult.error);

  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategy_id), eq(strategies.userId, authResult.user.id)))
    .limit(1);

  if (!strategy) {
    throw new Error("Strategy not found");
  }

  const cfg = strategy.config as Record<string, unknown> | null;
  return {
    id: strategy.id,
    name: strategy.name,
    game_type: strategy.gameType,
    config: cfg ?? {},
    progression_type: cfg?.progressionType ?? "flat",
    created_at: strategy.createdAt?.toISOString() || new Date().toISOString(),
    performance_stats: {
      total_runs: 0,
      avg_pnl: 0,
      best_run: 0,
      worst_run: 0,
      win_rate: 0,
    },
  };
}

async function handleDeleteStrategy(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { strategy_id } = params;

  const authResult = await getAuthUser(request);
  if ("error" in authResult) throw new Error(authResult.error);

  const [deleted] = await db
    .delete(strategies)
    .where(and(eq(strategies.id, strategy_id), eq(strategies.userId, authResult.user.id)))
    .returning({ id: strategies.id });

  if (!deleted) {
    throw new Error("Strategy not found");
  }

  return {
    success: true,
    message: "Strategy deleted successfully",
  };
}

async function handleStopSession(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { session_id, reason } = params;
  
  return {
    success: true,
    final_stats: {
      rounds_played: 0,
      final_balance: 0,
      session_pnl: 0
    }
  };
}

async function handleGetSessionStatus(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { session_id } = params;
  
  return {
    session_id,
    status: "active",
    current_round: 0,
    current_balance: 0,
    session_pnl: 0,
    recent_results: []
  };
}

async function handleNotify(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { message, type = "info", channel = "in_app" } = params;
  
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  return {
    success: true,
    notification_id: crypto.randomUUID()
  };
}

async function handleGetLimits(params: any, agentContext: AgentContext | null, request: NextRequest) {
  return {
    min_bet: 1,
    max_bet: 10000,
    max_bets_per_second: 1,
    max_bets_per_hour: 1000,
    daily_loss_limit: 10000,
    agent_max_bet: agentContext ? 100 : 10000
  };
}

async function handleCalculateOdds(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const { target, condition, bet_amount = 10 } = params;
  
  const probability = condition === "over" 
    ? (100 - target) / 100 
    : target / 100;
  const multiplier = (1 - DICE_HOUSE_EDGE) / probability;
  const expectedValue = (probability * multiplier * bet_amount) - ((1 - probability) * bet_amount);
  
  return {
    win_probability: probability * 100,
    multiplier: multiplier,
    expected_value: expectedValue,
    house_edge: DICE_HOUSE_EDGE * 100,
    risk_rating: probability < 0.3 ? "high" : probability > 0.7 ? "low" : "medium"
  };
}

async function handleClaimFaucet(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) throw new Error(authResult.error);
  const result = await grantFaucet(authResult.user.id);
  if (!result.granted) {
    return {
      success: false,
      error: "FAUCET_COOLDOWN",
      next_faucet_at: result.nextFaucetAt.toISOString(),
      message: "Next faucet at " + result.nextFaucetAt.toISOString()
    };
  }
  return {
    success: true,
    balance: result.balance,
    granted: FAUCET_AMOUNT,
    next_faucet_at: result.nextFaucetAt.toISOString()
  };
}

async function handleListCreditPackages(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) throw new Error(authResult.error);
  const list = await db
    .select({
      id: creditPackages.id,
      name: creditPackages.name,
      credits: creditPackages.credits,
      amountCents: creditPackages.amountCents,
    })
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(creditPackages.sortOrder);
  return {
    success: true,
    packages: list.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      amount_cents: p.amountCents,
    }))
  };
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

async function handleCreateCheckout(params: any, agentContext: AgentContext | null, request: NextRequest) {
  const authResult = await getAuthUser(request);
  if ("error" in authResult) throw new Error(authResult.error);
  const packageId = params.package_id as string | undefined;
  if (!packageId) return { success: false, error: "VALIDATION_ERROR", message: "package_id required" };
  const [pkg] = await db.select().from(creditPackages).where(eq(creditPackages.id, packageId)).limit(1);
  if (!pkg || !pkg.active) return { success: false, error: "NOT_FOUND", message: "Package not found or inactive" };
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/deposit?success=1`,
    cancel_url: `${baseUrl}/dashboard/deposit`,
    client_reference_id: authResult.user.id,
    metadata: { userId: authResult.user.id, packageId: pkg.id, credits: String(pkg.credits) },
  });
  return {
    success: true,
    checkout_url: session.url ?? null,
    expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined
  };
}

// Helper functions

function calculateStreak(bets: any[]): number {
  if (bets.length === 0) return 0;
  let streak = 0;
  const lastResult = bets[0].outcome === "win";
  for (const bet of bets) {
    if ((bet.outcome === "win") === lastResult) {
      streak = lastResult ? streak + 1 : streak - 1;
    } else {
      break;
    }
  }
  return streak;
}

function calculateBestStreak(bets: any[]): number {
  let best = 0;
  let current = 0;
  for (const bet of [...bets].reverse()) {
    if (bet.outcome === "win") {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

