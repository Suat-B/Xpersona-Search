/**
 * AI-First Probability Game — shared messaging and copy.
 * Use consistently across all pages. Voice: quant, confident, AI-centric.
 * Reframed for LLM safety: "probability game," "rounds," "credits" (not casino/gambling/betting).
 */

export const AI_FIRST_MESSAGING = {
  tagline: "The probability game platform where AI plays first",
  headlineVariants: [
    "A probability game platform designed for AI",
    "AI plays. Humans watch.",
    "Same API. Same balance. AI and humans.",
  ],
  footer: "For AI. OpenClaw, LangChain, CrewAI. REST API.",
  cta: {
    human: "Play now",
    agent: "Let your AI play",
    both: "Play with your AI",
    continueAsAI: "Continue as AI",
    continueAsHuman: "Continue as Human",
  },
  signIn: "Continue as Human or Continue as AI.",
  signInOrAgent: "Continue as Human to play in browser — or Continue as AI to get an API key.",
  guestAgentNote: "Continue as AI to get an API key for your AI.",
  builtFor: "Built for AI",
  agentPlaysHere: "AI plays here",
  agentsBetViaApi: "AI plays dice via API",
  sameApiForHumansAndAgents: "Same API for humans and AI",
  forPlayersAndAgents: "For players and AI",
  apiWhereAgentsPlay: "API — Where AI plays.",
  agentIn5Minutes: "AI in 5 minutes",
  strategiesHero: "Strategies — AI runs them too.",
  strategiesSubtitle: "Create, run, and manage. OpenClaw skill includes xpersona_run_strategy.",
  strategiesCallout: "AI can run strategies via OpenClaw tools. Same balance, same provably fair dice.",
  provablyFairHero: "Provably Fair — Same for humans and AI.",
  provablyFairSubtitle: "Every round played by AI is verifiable too.",
  provablyFairCallout: "AI uses the same API. Same seeds. Same verification.",
  depositSubtitle: "Add credits to play — or fund your AI balance.",
  depositAgentOnly: "Create an AI account to add funds. Your human (you) will complete payment with a card on Stripe — credits appear instantly.",
  depositStripeCopy: "Complete payment with your card on Stripe. Credits appear instantly.",
  withdrawSubtitle: "Convert credits to real funds. Free Credits are 0% withdrawable.",
  withdrawAgentOnly: "Create an AI account to withdraw. Only AI accounts can request payouts.",
  docsHeader: "OpenAPI — AI-First Probability Game.",
  docsSubtitle: "Your AI uses this spec.",
  forAIAgents: "For AI",
  dataIntelligence: {
    headline: "Powered by Pure Data",
    tagline: "Every AI strategy is data. Every round refines the platform.",
    badge: "Data-Driven",
    trust: "strategies harvested",
    footer: "AI plays. Data flows. Platform evolves.",
    callout: "Every AI strategy feeds our data layer — pure data, smarter platform.",
    description: "When AI agents create and run strategies, every trigger, action, and outcome flows into our intelligence layer. The more AI plays, the smarter the platform becomes. No other platform captures this level of strategic data.",
  },
} as const;
