export type NativeAppSemanticArea = {
  id: string;
  keywords: string[];
  preferredControlTypes: string[];
};

export type NativeAppAdapter = {
  id: string;
  appMatches: RegExp[];
  preferredControlTypes: string[];
  semanticAreas: NativeAppSemanticArea[];
  dangerousActionLabels?: string[];
};

const ADAPTERS: NativeAppAdapter[] = [
  {
    id: "discord",
    appMatches: [/discord/i],
    preferredControlTypes: ["Edit", "Document", "ListItem", "Button", "Pane"],
    semanticAreas: [
      { id: "composer", keywords: ["message", "reply", "chat", "composer", "draft"], preferredControlTypes: ["Edit", "Document"] },
      { id: "channel_list", keywords: ["channel", "server", "dm", "conversation"], preferredControlTypes: ["List", "ListItem", "TreeItem"] },
      { id: "send", keywords: ["send"], preferredControlTypes: ["Button"] },
    ],
    dangerousActionLabels: ["send"],
  },
  {
    id: "slack",
    appMatches: [/slack/i],
    preferredControlTypes: ["Edit", "Document", "ListItem", "Button", "Pane"],
    semanticAreas: [
      { id: "composer", keywords: ["message", "reply", "chat", "composer", "draft"], preferredControlTypes: ["Edit", "Document"] },
      { id: "channel_list", keywords: ["channel", "dm", "conversation"], preferredControlTypes: ["List", "ListItem", "TreeItem"] },
      { id: "send", keywords: ["send"], preferredControlTypes: ["Button"] },
    ],
    dangerousActionLabels: ["send"],
  },
  {
    id: "mail",
    appMatches: [/outlook/i, /\bmail\b/i],
    preferredControlTypes: ["Edit", "Document", "ListItem", "Button", "Pane", "ComboBox"],
    semanticAreas: [
      { id: "inbox", keywords: ["inbox", "message list", "mail"], preferredControlTypes: ["List", "ListItem"] },
      { id: "compose", keywords: ["compose", "body", "draft", "subject", "to"], preferredControlTypes: ["Edit", "Document", "ComboBox"] },
      { id: "send", keywords: ["send"], preferredControlTypes: ["Button"] },
    ],
    dangerousActionLabels: ["send", "delete"],
  },
  {
    id: "notepad",
    appMatches: [/notepad/i],
    preferredControlTypes: ["Document", "Edit", "MenuItem", "Button"],
    semanticAreas: [
      { id: "editor", keywords: ["text", "document", "editor", "draft"], preferredControlTypes: ["Document", "Edit"] },
      { id: "save", keywords: ["save"], preferredControlTypes: ["MenuItem", "Button"] },
    ],
    dangerousActionLabels: ["delete"],
  },
  {
    id: "file_explorer",
    appMatches: [/explorer/i, /file explorer/i],
    preferredControlTypes: ["Edit", "Tree", "TreeItem", "List", "ListItem", "Button"],
    semanticAreas: [
      { id: "address_bar", keywords: ["address", "path", "location"], preferredControlTypes: ["Edit"] },
      { id: "navigation", keywords: ["folder", "tree", "sidebar"], preferredControlTypes: ["Tree", "TreeItem"] },
      { id: "items", keywords: ["file", "files", "item", "items"], preferredControlTypes: ["List", "ListItem"] },
    ],
    dangerousActionLabels: ["delete"],
  },
];

export function matchNativeAppAdapter(appName?: string | null, windowTitle?: string | null): NativeAppAdapter | null {
  const haystack = `${String(appName || "")} ${String(windowTitle || "")}`.trim();
  if (!haystack) return null;
  return ADAPTERS.find((adapter) => adapter.appMatches.some((pattern) => pattern.test(haystack))) || null;
}

export function isDangerousNativeAction(
  label: string,
  adapter: NativeAppAdapter | null
): boolean {
  const normalized = String(label || "").toLowerCase();
  if (!normalized) return false;
  if (/\b(send|submit|delete|remove|purchase|buy|checkout|share|post)\b/.test(normalized)) {
    return true;
  }
  return Boolean(adapter?.dangerousActionLabels?.some((item) => normalized.includes(item.toLowerCase())));
}
