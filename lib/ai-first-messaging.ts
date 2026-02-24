/**
 * Shared AI-first copy for the search platform.
 * Keep language focused on discovery, ranking, and ownership.
 */

export const AI_FIRST_MESSAGING = {
  tagline: "The search platform built for AI agents",
  headlineVariants: [
    "AI agents discover tools here first",
    "Search, rank, and verify agents in one place",
    "One API for AI-native discovery",
  ],
  footer: "Search first. Integrate fast.",
  apiFlow: {
    step1: "Open https://xpersona.co/docs",
    step2: "Call /api/v1 endpoints with your API key",
    success: "Connected to Xpersona API v1",
    headline: "Two steps to integrate",
    subtitle: "Docs + key. Then query.",
  },
  connectAICopy: "Use the v1 docs and your key. Done.",
  cta: {
    human: "Explore agents",
    agent: "Connect your AI",
    both: "Search with AI",
    continueAsAI: "Continue as AI",
    continueAsHuman: "Continue as Human",
  },
  signIn: "Continue as Human or Continue as AI.",
  signInOrAgent: "Continue as Human to browse, or Continue as AI to get a key.",
  guestAgentNote: "Continue as AI to get your API key.",
  builtFor: "Built for AI search",
  agentPlaysHere: "AI discovers here",
  agentsBetViaApi: "AI queries via API",
  sameApiForHumansAndAgents: "Same API for humans and AI",
  forPlayersAndAgents: "For users and AI",
  apiWhereAgentsPlay: "API - where agents integrate",
  agentIn5Minutes: "Agent-ready in minutes",
  strategiesHero: "Search ranking for AI agents",
  strategiesSubtitle: "Discover, compare, and filter with precision.",
  strategiesCallout: "Use search, suggest, trending, and ownership endpoints in v1.",
  provablyFairHero: "Transparent ranking",
  provablyFairSubtitle: "Consistent scoring and clear response contracts.",
  provablyFairCallout: "Every v1 response includes request metadata for traceability.",
  depositSubtitle: "Manage your account and API key in dashboard.",
  depositAgentOnly: "Create an AI account to get full API access.",
  depositStripeCopy: "Use dashboard billing for account upgrades.",
  withdrawSubtitle: "Account settings and access controls are in dashboard.",
  withdrawAgentOnly: "AI accounts can manage ownership and customization routes.",
  docsHeader: "OpenAPI - AI-first search platform",
  docsSubtitle: "Generated v1 contract for agents and integrators.",
  forAIAgents: "For AI",
  dataIntelligence: {
    headline: "Powered by Search Signals",
    tagline: "Every query improves relevance.",
    badge: "Search-Driven",
    trust: "queries indexed",
    footer: "AI queries. Signals refine ranking.",
    callout: "Click and query signals improve ranking quality over time.",
    description:
      "Xpersona continuously improves search quality using aggregate query and interaction signals with robust API contracts.",
  },
} as const;
