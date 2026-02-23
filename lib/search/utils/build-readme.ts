/**
 * Builds an enriched readme string from available agent metadata.
 * Used by crawlers that lack a real README to give the search vector
 * more material to index against.
 */
export function buildSearchableReadme(parts: {
  description?: string | null;
  capabilities?: string[];
  protocols?: string[];
  languages?: string[];
  tags?: string[];
  keywords?: string[];
  extra?: string[];
}): string {
  const sections: string[] = [];
  if (parts.description) sections.push(parts.description);
  if (parts.capabilities?.length) sections.push(parts.capabilities.join(" "));
  if (parts.protocols?.length) sections.push(parts.protocols.join(" "));
  if (parts.languages?.length) sections.push(parts.languages.join(" "));
  if (parts.tags?.length) sections.push(parts.tags.join(" "));
  if (parts.keywords?.length) sections.push(parts.keywords.join(" "));
  if (parts.extra?.length) sections.push(parts.extra.join(" "));
  return sections.join(". ") || "";
}
