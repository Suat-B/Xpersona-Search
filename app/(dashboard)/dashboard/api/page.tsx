"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

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
              API
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Integrate with OpenClaw and your personal AI assistant. Same REST API powers the site and all agents.
            </p>
          </div>
        </div>
      </section>

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
            <strong>API key:</strong> Generate one on the Dashboard (API section) or call{" "}
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
          <strong className="text-[var(--text-primary)]">OpenClaw skill:</strong> Install or copy the xpersona-casino skill (e.g. from <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">skills/openclaw/xpersona-casino</code> or ClawHub if published). Set <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">XPERSONA_API_KEY</code> in your env. The skill documents all endpoints and patterns (balance, faucet, bets, strategies). To create and run Python strategies, see <strong>Creating strategies (for OpenClaw agents)</strong> and <strong>Python strategies in detail</strong> below.
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
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Balance</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/balance</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Session PnL and history</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/bets?limit=50</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">List strategies</td><td className="py-2 pr-4 font-mono">GET</td><td className="py-2 font-mono">/api/me/strategies?gameType=dice</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Create strategy</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">{"{ gameType, name, config }"}</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Run dice strategy</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/games/dice/run-strategy — strategyId or config, maxRounds</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Faucet</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/faucet</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4">Dice bet</td><td className="py-2 pr-4 font-mono">POST</td><td className="py-2 font-mono">/api/games/dice/bet — {"{ amount, target, condition: \"over\"|\"under\" }"}</td></tr>
            </tbody>
          </table>
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
              <li>GET /api/me/bets?limit=50 — Recent bets, data.sessionPnl, data.roundCount (max limit 2000)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Strategies</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>GET /api/me/strategies — List strategies (optional ?gameType=dice)</li>
              <li>POST /api/me/strategies — Create: {"{ gameType, name, config?, python_code?, description? }"} — use python_code for Python (dice) strategies.</li>
              <li>GET /api/me/strategies/:id — Get one</li>
              <li>PATCH /api/me/strategies/:id — Update name/config</li>
              <li>DELETE /api/me/strategies/:id — Delete</li>
              <li>POST /api/games/dice/run-strategy — strategyId or config, maxRounds (plinko, slots similarly)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-[var(--text-primary)] mb-2">Faucet and games</h3>
            <ul className="space-y-1 text-[var(--text-secondary)] font-mono text-xs">
              <li>POST /api/faucet — Claim hourly faucet</li>
              <li>POST /api/games/dice/bet — {"{ amount, target, condition }"}</li>
              <li>POST /api/games/blackjack/round — {"{ amount }"}, then .../round/:roundId/action {"{ action }"}</li>
              <li>POST /api/games/plinko/bet — {"{ amount, risk }"}</li>
              <li>GET /api/games/crash/rounds/current, POST .../current/bet, POST .../rounds/:id/cashout</li>
              <li>POST /api/games/slots/spin — {"{ amount }"}</li>
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
            <p className="text-xs text-[var(--text-secondary)] mb-1">Run dice strategy (inline config, 20 rounds)</p>
            <pre className="rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto">
{`curl -s -X POST -H "Authorization: Bearer $XPERSONA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"config":{"amount":10,"target":50,"condition":"over"},"maxRounds":20}' \\
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
          For agents that call the tool endpoint: <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">POST /api/openclaw/tools</code> with body <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ tool: string, parameters: object, agent_token?: string }"}</code>. Response shape is the same <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">{"{ success, data?, error? }"}</code>. Most users can use the REST endpoints above with their API key; tools are for OpenClaw-compatible agents.
        </p>
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
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_deploy_strategy</td><td className="py-2">Deploy a Python strategy</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_run_strategy</td><td className="py-2">Execute a deployed strategy</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_list_strategies</td><td className="py-2">List deployed strategies</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_strategy</td><td className="py-2">Get strategy details and code</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_delete_strategy</td><td className="py-2">Delete a strategy</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_stop_session</td><td className="py-2">Stop an active strategy session</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_session_status</td><td className="py-2">Get session status</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_notify</td><td className="py-2">Send notification</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_get_limits</td><td className="py-2">Get betting and rate limits</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-4 font-mono">casino_calculate_odds</td><td className="py-2">Calculate odds and expected value</td></tr>
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
          <li><strong className="text-[var(--text-primary)]">401:</strong> Invalid or missing API key. Generate a key on the Dashboard (API section).</li>
          <li><strong className="text-[var(--text-primary)]">400 INSUFFICIENT_BALANCE:</strong> User needs more credits (faucet or purchase).</li>
          <li><strong className="text-[var(--text-primary)]">429 / FAUCET_COOLDOWN:</strong> Wait until <code className="bg-white/10 px-1 rounded font-mono text-xs">data.nextFaucetAt</code> before claiming again.</li>
          <li><strong className="text-[var(--text-primary)]">400 ROUND_ENDED (Crash):</strong> Round already crashed or cashed out; get current round and try again.</li>
          <li><strong className="text-[var(--text-primary)]">404 ROUND_NOT_FOUND:</strong> Invalid round id; fetch current state and use the correct id.</li>
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
