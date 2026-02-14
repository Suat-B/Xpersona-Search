"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";

export default function ApiDocsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20">
            <svg className="w-6 h-6 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
              {AI_FIRST_MESSAGING.apiWhereAgentsPlay}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Same REST API for humans and agents. OpenClaw, LangChain, CrewAI.
            </p>
            <p className="mt-2 text-xs text-[var(--accent-heart)] font-medium">
              Copy your API key. Set <code className="bg-white/10 px-1 rounded font-mono">XPERSONA_API_KEY</code>. Your AI can play.
            </p>
          </div>
        </div>
      </section>

      {/* API Key Management */}
      <ApiKeySection />

      {/* Agent in 5 minutes */}
      <GlassCard className="p-6 border-[var(--accent-heart)]/20">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          {AI_FIRST_MESSAGING.agentIn5Minutes}
        </h2>
        <ol className="space-y-3 text-sm text-[var(--text-primary)] list-decimal list-inside">
          <li>Generate API key from above.</li>
          <li>Set <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code> in your env.</li>
          <li><code className="bg-white/10 px-1 rounded font-mono">GET /api/me/balance</code> — verify auth.</li>
          <li><code className="bg-white/10 px-1 rounded font-mono">POST /api/faucet</code> — claim credits.</li>
          <li><code className="bg-white/10 px-1 rounded font-mono">POST /api/games/dice/bet</code> — place a bet.</li>
        </ol>
      </GlassCard>

      {/* Getting started */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Getting started
        </h2>
        <ul className="space-y-3 text-sm text-[var(--text-primary)]">
          <li>
            <strong>Base URL:</strong>{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">https://xpersona.co</code>
            {" "}(or set <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_BASE_URL</code> for local/dev).
          </li>
          <li>
            <strong>Auth:</strong> Send{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">Authorization: Bearer &lt;API_KEY&gt;</code>{" "}
            on every request (except health and public credit packages).
          </li>
          <li>
            <strong>Response shape:</strong> JSON{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ success: boolean, data?: object, error?: string }"}</code>.
            On error, the body includes <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">error</code> (e.g. <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">INSUFFICIENT_BALANCE</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">VALIDATION_ERROR</code>).
          </li>
          <li>
            <strong>API key:</strong> Generate one above using the API Key Manager or call{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">POST /api/me/api-key</code> (returns the key once; store as <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code> or in your client).
          </li>
        </ul>
      </GlassCard>

      {/* OpenClaw / personal AI integration */}
      <GlassCard className="p-6 border-[var(--accent-heart)]/10">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          OpenClaw and personal AI integration
        </h2>
        <p className="text-sm text-[var(--text-primary)] mb-4">
          Use the same REST API from OpenClaw or any AI assistant. Set the user&apos;s API key (e.g. env <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code>), then call the endpoints below. No separate agent API — the website and all agents use the same routes.
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          <strong className="text-[var(--text-primary)]">OpenClaw skill:</strong> Install or copy the xpersona-casino skill (e.g. from <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">skills/openclaw/xpersona-casino</code> or ClawHub if published). Set <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code> in your env. The skill documents all endpoints and patterns (balance, faucet, bets, strategies). To create and run strategies, see <strong>Creating strategies (for OpenClaw agents)</strong> below.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Method</th>
                <th className="py-2">Path / Body</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-primary)]">
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Session stats <span className="text-[var(--accent-heart)] text-[10px]">AI-first</span></td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/session-stats?gameType=dice&limit=50</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Balance</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/balance</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Session PnL and history</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/bets?limit=50</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">List strategies</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/strategies?gameType=dice</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Create strategy</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">{"{ gameType, name, config }"}</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Run dice strategy</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/games/dice/run-strategy — strategyId or config, maxRounds</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Faucet <span className="text-[var(--accent-heart)] text-[10px]">AI-first</span></td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/faucet</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Dice bet <span className="text-[var(--accent-heart)] text-[10px]">AI-first</span></td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/games/dice/bet — {"{ amount, target, condition: \"over\"|\"under\" }"}</td></tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* For AI agents */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          For AI agents
        </h2>
        <ul className="space-y-2 text-sm text-[var(--text-primary)]">
          <li><strong>Session stats:</strong> Prefer <code className="bg-white/10 px-1 rounded font-mono text-xs">GET /api/me/session-stats</code> over balance + bets for &quot;how am I doing?&quot; — single call returns balance, rounds, PnL, win rate, recent bets.</li>
          <li><strong>Tools vs REST:</strong> Use Tools API (<code className="bg-white/10 px-1 rounded font-mono text-xs">POST /api/openclaw/tools</code>) when OpenClaw is configured for it. Otherwise use REST with the same auth.</li>
          <li><strong>Recommended flow:</strong> (1) Get balance or session-stats. (2) If low, claim faucet or suggest deposit. (3) Place bets or run strategy. (4) Report PnL.</li>
        </ul>
      </GlassCard>

      {/* Dice odds */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Dice rules and odds
        </h2>
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          <li><strong className="text-[var(--text-primary)]">House edge:</strong> 3%</li>
          <li><strong className="text-[var(--text-primary)]">Min/max bet:</strong> 1 – 10000 credits</li>
          <li><strong className="text-[var(--text-primary)]">Win probability:</strong> over X → (100-X)/100; under X → X/100 (e.g. over 50 = 49% win)</li>
          <li><strong className="text-[var(--text-primary)]">Multiplier:</strong> 0.97 / winProbability (e.g. over 50 ≈ 1.98x payout)</li>
          <li><strong className="text-[var(--text-primary)]">Faucet:</strong> 100 credits, 1h cooldown</li>
        </ul>
      </GlassCard>

      {/* Creating strategies (for OpenClaw agents) */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Creating strategies (for OpenClaw agents)
        </h2>
        <p className="text-sm text-[var(--text-primary)] mb-4">
          Create strategies via <strong>REST</strong> (<code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">POST /api/me/strategies</code>) or run inline via <strong>OpenClaw</strong> (<code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">casino_run_strategy</code> with <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">config</code>).
        </p>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">REST — Create strategy</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] text-xs list-disc list-inside">
              <li>Body: <code className="bg-white/10 px-1 rounded font-mono">gameType</code> (required), <code className="bg-white/10 px-1 rounded font-mono">name</code> (required), <code className="bg-white/10 px-1 rounded font-mono">config</code> (required: amount, target, condition; optional: progressionType).</li>
              <li>Config: <code className="bg-white/10 px-1 rounded font-mono">{"{ amount, target, condition, progressionType?: \"flat\"|\"martingale\"|\"paroli\"|\"dalembert\"|\"fibonacci\"|\"labouchere\"|\"oscar\"|\"kelly\", maxBet?, maxConsecutiveLosses?, maxConsecutiveWins? }"}</code></li>
              <li>Response: <code className="bg-white/10 px-1 rounded font-mono">{"{ success, data: { id, gameType, name, config, createdAt } }"}</code></li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Running a strategy</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] text-xs list-disc list-inside">
              <li>REST: <code className="bg-white/10 px-1 rounded font-mono">POST /api/games/dice/run-strategy</code> with <code className="bg-white/10 px-1 rounded font-mono">{"{ strategyId?, config?, maxRounds? }"}</code>. Use <code className="bg-white/10 px-1 rounded font-mono">strategyId</code> for saved strategies or <code className="bg-white/10 px-1 rounded font-mono">config</code> for inline (same shape as create).</li>
              <li>OpenClaw: <code className="bg-white/10 px-1 rounded font-mono">casino_run_strategy</code> with <code className="bg-white/10 px-1 rounded font-mono">strategy_id</code> or <code className="bg-white/10 px-1 rounded font-mono">config</code>, optional <code className="bg-white/10 px-1 rounded font-mono">max_rounds</code>. Executes synchronously; returns session_pnl, final_balance, results.</li>
            </ul>
          </div>
        </div>
      </GlassCard>

      {/* REST endpoint reference */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          REST endpoint reference
        </h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Auth / Me</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>GET /api/me — Current user (id, email, credits, apiKeyPrefix)</li>
              <li>GET /api/me/balance — Balance (data.balance)</li>
              <li>POST /api/me/api-key — Generate API key (returns key once)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Bets and session PnL</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>GET /api/me/session-stats?gameType=dice&limit=50 — Balance, rounds, PnL, win rate, recent bets (AI-first)</li>
              <li>GET /api/me/bets?limit=50 — Recent bets, data.sessionPnl, data.roundCount (max limit 200)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Strategies</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>GET /api/me/strategies — List strategies (optional ?gameType=dice)</li>
              <li>POST /api/me/strategies — Create: {"{ gameType, name, config }"} — config must include amount, target, condition; optional progressionType.</li>
              <li>GET /api/me/strategies/:id — Get one</li>
              <li>PATCH /api/me/strategies/:id — Update name/config</li>
              <li>DELETE /api/me/strategies/:id — Delete</li>
              <li>POST /api/games/dice/run-strategy — strategyId or config, maxRounds</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Faucet and games</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>POST /api/faucet — Claim hourly faucet</li>
              <li>POST /api/games/dice/bet — {"{ amount, target, condition }"}</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Credits</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>GET /api/credits/packages — List packages (no auth)</li>
              <li>POST /api/credits/checkout — {"{ packageId }"} → Stripe checkout URL</li>
            </ul>
          </div>
        </div>
      </GlassCard>

      {/* Curl examples */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Examples (curl)
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Session stats (AI-first)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -H "Authorization: Bearer $XPERSONA_API_KEY" "https://xpersona.co/api/me/session-stats?gameType=dice&limit=20"`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Check balance</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -H "Authorization: Bearer $XPERSONA_API_KEY" https://xpersona.co/api/me/balance`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Place dice bet (10 credits, over 50)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"amount":10,"target":50,"condition":"over"}' https://xpersona.co/api/games/dice/bet`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Run dice strategy (inline config with Martingale, 20 rounds)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"config":{"amount":10,"target":50,"condition":"over","progressionType":"martingale"},"maxRounds":20}' \\
  https://xpersona.co/api/games/dice/run-strategy`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Create strategy (config with progression)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"gameType":"dice","name":"Martingale 50","config":{"amount":10,"target":50,"condition":"over","progressionType":"martingale"}}' \\
  https://xpersona.co/api/me/strategies`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Run dice strategy by strategyId (20 rounds)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"strategyId":"<strategy-id-from-create>","maxRounds":20}' \\
  https://xpersona.co/api/games/dice/run-strategy`}
            </pre>
          </div>
        </div>
      </GlassCard>

      {/* OpenClaw Tools API */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          OpenClaw Tools API (agent tools)
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          For agents that call the tool endpoint: <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">POST /api/openclaw/tools</code> with body <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ tool: string, parameters: object, agent_token?: string }"}</code>. Response: <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ success, tool, result, meta? }"}</code> or <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ success: false, error }"}</code>. Most users can use the REST endpoints above with their API key; tools are for OpenClaw-compatible agents.
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          <strong className="text-[var(--text-primary)]">Auth:</strong> Send <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">Authorization: Bearer &lt;API_KEY&gt;</code> (same as REST). Required for tool execution (except <code className="bg-white/10 px-1 rounded font-mono text-xs">casino_auth_guest</code>).
        </p>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          <strong className="text-[var(--text-primary)]">Discovery:</strong> <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">GET /api/openclaw/tools</code> returns the full tool schema (tool names, parameters, returns) for programmatic discovery.
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-2">Example: get balance</p>
        <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-3 text-xs font-mono text-[var(--text-primary)] overflow-x-auto mb-4">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"tool":"casino_get_balance","parameters":{}}' https://xpersona.co/api/openclaw/tools`}
        </pre>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                <th className="py-2 pr-4">Tool</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-primary)]">
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_auth_guest</td><td className="py-2">Create or authenticate as guest</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_auth_agent</td><td className="py-2">Authenticate as AI agent</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_place_dice_bet</td><td className="py-2">Place a dice bet</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_balance</td><td className="py-2">Get balance and session info</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_history</td><td className="py-2">Get game history and stats</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_analyze_patterns</td><td className="py-2">Analyze patterns and trends</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_run_strategy</td><td className="py-2">Run dice strategy (strategy_id or inline config)</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_list_strategies</td><td className="py-2">List deployed strategies</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_strategy</td><td className="py-2">Get strategy details (config, progression_type)</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_delete_strategy</td><td className="py-2">Delete a strategy</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_notify</td><td className="py-2">Send notification</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_limits</td><td className="py-2">Get betting and rate limits</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_calculate_odds</td><td className="py-2">Calculate dice odds and expected value</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_claim_faucet</td><td className="py-2">Claim hourly faucet</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_list_credit_packages</td><td className="py-2">List credit packages for purchase</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_create_checkout</td><td className="py-2">Create Stripe checkout URL for deposit</td></tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Troubleshooting and footer */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Troubleshooting
        </h2>
        <ul className="space-y-2 text-sm text-[var(--text-secondary)] list-disc list-inside">
          <li><strong className="text-[var(--text-primary)]">401:</strong> Invalid or missing API key. Generate a key using the API Key Manager above.</li>
          <li><strong className="text-[var(--text-primary)]">400 INSUFFICIENT_BALANCE:</strong> User needs more credits (faucet or purchase).</li>
          <li><strong className="text-[var(--text-primary)]">429 / FAUCET_COOLDOWN:</strong> Wait until <code className="bg-white/10 px-1 rounded font-mono text-xs">data.nextFaucetAt</code> before claiming again.</li>
        </ul>
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <Link
            href="/openapi.yaml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Full OpenAPI spec (openapi.yaml)
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
