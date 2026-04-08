/**
 * Text analysis utilities for note summarization
 */

/**
 * Split text into sentences
 * @param {string} text - Input text
 * @returns {string[]} Array of sentences
 */
export function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Split on sentence endings followed by space or end of string
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Split text into words (tokens)
 * @param {string} text - Input text
 * @returns {string[]} Array of words
 */
export function splitIntoWords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Calculate word frequency in text
 * @param {string} text - Input text
 * @returns {Map<string, number>} Word frequency map
 */
export function calculateWordFrequency(text) {
  const words = splitIntoWords(text);
  const frequency = new Map();

  for (const word of words) {
    // Skip very common words (simple stop words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'over']);
    
    if (!stopWords.has(word) && word.length > 2) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }

  return frequency;
}

/**
 * Score a sentence based on word frequency and position
 * @param {string} sentence - The sentence to score
 * @param {Map<string, number>} wordFrequency - Word frequency map
 * @param {number} totalSentences - Total number of sentences
 * @param {number} sentenceIndex - Index of this sentence
 * @returns {number} Score for the sentence
 */
export function scoreSentence(sentence, wordFrequency, totalSentences, sentenceIndex) {
  const words = splitIntoWords(sentence);
  
  if (words.length === 0) {
    return 0;
  }

  // Calculate frequency score
  let frequencyScore = 0;
  for (const word of words) {
    frequencyScore += wordFrequency.get(word) || 0;
  }
  frequencyScore = frequencyScore / words.length;

  // Position bonus (early sentences often contain important info)
  const positionBonus = 1 + (1 - sentenceIndex / totalSentences) * 0.5;

  // Sentence length bonus (prefer medium-length sentences)
  const length = words.length;
  let lengthBonus = 1;
  if (length >= 5 && length <= 25) {
    lengthBonus = 1.2;
  } else if (length < 5 || length > 30) {
    lengthBonus = 0.8;
  }

  return frequencyScore * positionBonus * lengthBonus;
}

/**
 * Extract top keywords from text
 * @param {string} text - Input text
 * @param {number} count - Number of keywords to extract
 * @returns {string[]} Array of keywords
 */
export function extractKeywords(text, count = 5) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return [];
  }

  // For very short text (fewer than 3 words), return empty array
  const words = splitIntoWords(cleanText);
  if (words.length < 3) {
    return [];
  }

  const frequency = calculateWordFrequency(text);
  
  // If we have no words after filtering, return empty
  if (frequency.size === 0) {
    return [];
  }
  
  // Sort by frequency (descending)
  const sorted = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);

  return sorted;
}

/**
 * Select best sentences for summary
 * @param {string[]} sentences - Array of sentences
 * @param {number} count - Number of sentences to select
 * @param {Map<string, number>} wordFrequency - Word frequency map
 * @returns {string[]} Selected sentences in original order
 */
export function selectBestSentences(sentences, count, wordFrequency) {
  if (sentences.length <= count) {
    return [...sentences];
  }

  // Score all sentences
  const scoredSentences = sentences.map((sentence, index) => ({
    sentence,
    score: scoreSentence(sentence, wordFrequency, sentences.length, index),
    index
  }));

  // Sort by score (descending) and take top N
  const topScored = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  // Sort by original index to maintain order
  return topScored
    .sort((a, b) => a.index - b.index)
    .map(item => item.sentence);
}