/**
 * Formats a name by trimming whitespace, title-casing each word, and returning 'Unknown' for empty input.
 * @param {string|null|undefined} name - The name to format
 * @returns {string} The formatted name or 'Unknown'
 */
export function formatName(name) {
  // Convert to string first to handle non-string inputs
  const str = String(name ?? '');
  
  // Return 'Unknown' for empty or whitespace-only input
  if (str.trim() === '') {
    return 'Unknown';
  }
  
  // Trim whitespace, convert to lowercase, then capitalize first letter of each word
  // Also handle hyphens and apostrophes within words (e.g., "mary-jane" -> "Mary-Jane")
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')  // Collapse multiple whitespace to single space
    .replace(/(^|[\s'-])\w/g, match => match.toUpperCase());
}

// Export for testing/module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatName };
}