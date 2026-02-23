export type VerificationMethod =
  | "GITHUB_FILE"
  | "NPM_KEYWORD"
  | "PYPI_KEYWORD"
  | "DNS_TXT"
  | "META_TAG"
  | "EMAIL_MATCH"
  | "MANUAL_REVIEW";

export interface MethodInfo {
  method: VerificationMethod;
  label: string;
  description: string;
  automated: boolean;
}

interface AgentLike {
  source?: string | null;
  url?: string;
  homepage?: string | null;
  npmData?: Record<string, unknown> | null;
  githubData?: { stars?: number; forks?: number; lastCommit?: string; defaultBranch?: string } | null;
}

export function getMaintainerEmail(agent: AgentLike): string | null {
  const npm = agent.npmData as Record<string, unknown> | null;
  if (npm?.maintainerEmail && typeof npm.maintainerEmail === "string") {
    return npm.maintainerEmail;
  }
  if (npm?.author && typeof npm.author === "object" && npm.author !== null) {
    const authorEmail = (npm.author as Record<string, unknown>).email;
    if (typeof authorEmail === "string") return authorEmail;
  }
  return null;
}

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function getAvailableMethods(agent: AgentLike): MethodInfo[] {
  const methods: MethodInfo[] = [];
  const source = (agent.source ?? "").toUpperCase();

  if (
    source.startsWith("GITHUB") &&
    agent.url &&
    parseGitHubRepo(agent.url)
  ) {
    methods.push({
      method: "GITHUB_FILE",
      label: "GitHub verification file",
      description:
        "Add a .xpersona-verify file to the root of your repository containing the verification token.",
      automated: true,
    });
  }

  if (source === "NPM") {
    methods.push({
      method: "NPM_KEYWORD",
      label: "npm keyword",
      description:
        'Add a keyword "xpersona-verify-{TOKEN}" to your package.json keywords array and publish a new version.',
      automated: true,
    });
  }

  if (source === "PYPI") {
    methods.push({
      method: "PYPI_KEYWORD",
      label: "PyPI keyword",
      description:
        "Add the verification token as a project keyword on PyPI and re-publish.",
      automated: true,
    });
  }

  if (agent.homepage) {
    methods.push({
      method: "DNS_TXT",
      label: "DNS TXT record",
      description:
        'Add a DNS TXT record "xpersona-verify={TOKEN}" to your homepage domain.',
      automated: true,
    });
    methods.push({
      method: "META_TAG",
      label: "HTML meta tag",
      description:
        'Add <meta name="xpersona-verify" content="{TOKEN}"> to your homepage HTML head.',
      automated: true,
    });
  }

  if (getMaintainerEmail(agent)) {
    methods.push({
      method: "EMAIL_MATCH",
      label: "Email match",
      description:
        "Your Xpersona account email matches the package maintainer email. Instant verification.",
      automated: true,
    });
  }

  methods.push({
    method: "MANUAL_REVIEW",
    label: "Request manual review",
    description:
      "Submit evidence of ownership for admin review. Provide links or screenshots proving you maintain this project.",
    automated: false,
  });

  return methods;
}

export function getInstructionsForMethod(
  method: VerificationMethod,
  token: string,
  agent: AgentLike
): string {
  switch (method) {
    case "GITHUB_FILE": {
      const gh = agent.url ? parseGitHubRepo(agent.url) : null;
      const branch = agent.githubData?.defaultBranch ?? "main";
      return gh
        ? `Create a file named .xpersona-verify at the root of ${gh.owner}/${gh.repo} (branch: ${branch}) with this exact content:\n\n${token}\n\nThen click Verify.`
        : `Create a .xpersona-verify file at your repo root with content: ${token}`;
    }
    case "NPM_KEYWORD": {
      const pkg =
        (agent.npmData as Record<string, unknown>)?.packageName ??
        (agent.npmData as Record<string, unknown>)?.name ??
        "your-package";
      return `Add "xpersona-verify-${token}" to the "keywords" array in your package.json for ${pkg}, then publish a new version (npm publish). Then click Verify.`;
    }
    case "PYPI_KEYWORD":
      return `Add "xpersona-verify-${token}" to your project keywords (setup.cfg or pyproject.toml) and publish to PyPI. Then click Verify.`;
    case "DNS_TXT": {
      const domain = agent.homepage
        ? new URL(agent.homepage).hostname
        : "your-domain.com";
      return `Add a DNS TXT record to ${domain} with value:\n\nxpersona-verify=${token}\n\nDNS changes may take up to 48 hours to propagate. Then click Verify.`;
    }
    case "META_TAG":
      return `Add this tag inside the <head> of your homepage (${agent.homepage ?? "your homepage"}):\n\n<meta name="xpersona-verify" content="${token}">\n\nThen click Verify.`;
    case "EMAIL_MATCH":
      return `Your account email will be compared to the package maintainer email on file. Click Verify to check.`;
    case "MANUAL_REVIEW":
      return `Provide evidence of ownership (links, screenshots) in the notes field. An admin will review your claim within 48 hours.`;
  }
}
