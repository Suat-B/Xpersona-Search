/**
 * Notes Workbench - Main entry point
 * Provides text summarization functionality
 */

import {
  splitIntoSentences,
  calculateWordFrequency,
  selectBestSentences,
  extractKeywords
} from './summary.js';

/**
 * Summarize a note by extracting the most important sentences
 * @param {string} text - The note text to summarize
 * @param {number} sentenceCount - Number of sentences in the summary (default: 3)
 * @returns {string} The summarized text
 */
export function summarize(text, sentenceCount = 3) {
  // Input validation
  if (!text || typeof text !== 'string') {
    return '';
  }

  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return '';
  }

  // Split into sentences
  const sentences = splitIntoSentences(cleanText);
  
  if (sentences.length === 0) {
    return cleanText;
  }

  // If we have fewer sentences than requested, return all
  if (sentences.length <= sentenceCount) {
    return sentences.join(' ');
  }

  // Calculate word frequency for scoring
  const wordFrequency = calculateWordFrequency(cleanText);

  // Select best sentences
  const selectedSentences = selectBestSentences(sentences, sentenceCount, wordFrequency);

  return selectedSentences.join(' ');
}

/**
 * Extract keywords from a note
 * @param {string} text - The note text
 * @param {number} keywordCount - Number of keywords to extract (default: 5)
 * @returns {string[]} Array of keywords
 */
export { extractKeywords } from './summary.js';

// Default export for convenience
export default { summarize, extractKeywords };