/**
 * Duration Toolkit - Parse and format time durations
 * Supports: ms, s, m, h, d
 */

/**
 * Parse a duration string to milliseconds
 * @param {string} input - Duration string like "1h 30m", "5s", "2d", "500ms"
 * @returns {number} Total milliseconds
 */
export function parseDuration(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Empty duration string');
  }

  // Pattern: number followed by optional space and unit (ms, s, m, h, d)
  // Unit is required - no default to prevent matching standalone numbers
  const pattern = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi;
  const matches = [...trimmed.matchAll(pattern)];
  
  if (matches.length === 0) {
    throw new Error(`Invalid duration format: "${input}"`);
  }

  // Check if the entire string was consumed by valid matches (allowing whitespace between)
  const lastIndex = matches.length > 0 ? matches[matches.length - 1].index + matches[matches.length - 1][0].length : 0;
  if (lastIndex < trimmed.length) {
    // Check if the remaining part is just whitespace
    const remaining = trimmed.slice(lastIndex).trim();
    if (remaining.length > 0) {
      throw new Error(`Invalid duration format: "${input}"`);
    }
  }

  let totalMs = 0;
  const unitMultipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  for (const match of matches) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    if (isNaN(value)) {
      throw new Error(`Invalid number in duration: "${match[1]}"`);
    }
    
    if (!unitMultipliers[unit]) {
      throw new Error(`Unknown time unit: "${unit}"`);
    }
    
    totalMs += value * unitMultipliers[unit];
  }

  return Math.floor(totalMs);
}

/**
 * Format milliseconds to a human-readable duration string
 * @param {number} ms - Milliseconds to format
 * @returns {string} Formatted duration like "1h 30m", "5s", etc.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
    throw new Error('Invalid milliseconds value');
  }

  if (ms === 0) {
    return '0ms';
  }

  const units = [
    { name: 'd', ms: 24 * 60 * 60 * 1000 },
    { name: 'h', ms: 60 * 60 * 1000 },
    { name: 'm', ms: 60 * 1000 },
    { name: 's', ms: 1000 },
    { name: 'ms', ms: 1 }
  ];

  const parts = [];
  let remaining = ms;

  for (const unit of units) {
    if (remaining >= unit.ms) {
      const value = Math.floor(remaining / unit.ms);
      if (value > 0) {
        parts.push(`${value}${unit.name}`);
        remaining %= unit.ms;
      }
    }
  }

  return parts.join(' ');
}