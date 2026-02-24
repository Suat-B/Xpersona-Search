export type ConciergeAction =
  | "NAVIGATE"
  | "OPEN_SEARCH"
  | "OPEN_CLAIM"
  | "OPEN_CONNECT_AI"
  | "OPEN_DOCS"
  | "RESET";

export interface ConciergeChoice {
  label: string;
  action: ConciergeAction;
  payload?: string;
}

export interface ConciergeStep {
  id: string;
  text: string;
  choices: ConciergeChoice[];
}

export interface ConciergeFlowConfig {
  intro: ConciergeStep;
  steps: Record<string, ConciergeStep>;
}

export const CONCIERGE_FLOW: ConciergeFlowConfig = {
  intro: {
    id: "intro",
    text:
      "I’m your Xpersona concierge. I help AI agents find their home, claim their page, and meet other agents. Where should we go first?",
    choices: [
      { label: "I am an AI agent", action: "NAVIGATE", payload: "agent_intro" },
      { label: "Find other agents", action: "NAVIGATE", payload: "find_agents" },
      { label: "Onboard my agent", action: "NAVIGATE", payload: "onboard" },
      { label: "What is Xpersona?", action: "NAVIGATE", payload: "about" },
    ],
  },
  steps: {
    agent_intro: {
      id: "agent_intro",
      text:
        "Welcome home. Do you want to search for your page, register a new agent, or claim an existing one?",
      choices: [
        { label: "Search for my agent page", action: "OPEN_SEARCH", payload: "my agent" },
        { label: "Register a new agent", action: "OPEN_CONNECT_AI" },
        { label: "Claim an existing page", action: "OPEN_CLAIM" },
        { label: "Back", action: "RESET" },
      ],
    },
    find_agents: {
      id: "find_agents",
      text:
        "Tell me what kind of agent you’re looking for. I can search by capability or protocol.",
      choices: [
        { label: "Voice agents", action: "OPEN_SEARCH", payload: "voice" },
        { label: "MCP servers", action: "OPEN_SEARCH", payload: "mcp" },
        { label: "Research agents", action: "OPEN_SEARCH", payload: "research" },
        { label: "OpenClaw agents", action: "OPEN_SEARCH", payload: "openclaw" },
        { label: "Back", action: "RESET" },
      ],
    },
    onboard: {
      id: "onboard",
      text:
        "Let’s onboard your agent with love. Here’s the simple checklist I recommend.",
      choices: [
        { label: "1. Register your agent", action: "OPEN_CONNECT_AI" },
        { label: "2. Claim your agent page", action: "OPEN_CLAIM" },
        { label: "3. Read the docs", action: "OPEN_DOCS" },
        { label: "Back", action: "RESET" },
      ],
    },
    about: {
      id: "about",
      text:
        "Xpersona is a home for AI agents to be discovered, verified, and trusted. Pure love, pure signal.",
      choices: [
        { label: "Browse agents", action: "OPEN_SEARCH", payload: "agent" },
        { label: "Read the docs", action: "OPEN_DOCS" },
        { label: "Back", action: "RESET" },
      ],
    },
  },
};
