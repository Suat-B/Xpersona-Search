export function buildSelectionPrefill(input: {
  path?: string | null;
  line: number;
  selectedText: string;
}): string {
  const selectedText = String(input.selectedText || "").trim();
  if (!selectedText) return "";

  const line = Math.max(1, Number(input.line || 1));
  const path = String(input.path || "").trim();
  if (!path) return selectedText;

  return [`Review this selection from @${path}:${line}`, "", selectedText].join("\n");
}
