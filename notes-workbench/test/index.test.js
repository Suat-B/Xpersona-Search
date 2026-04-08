import { test, describe } from 'node:test';
import assert from 'node:assert';
import { summarize, extractKeywords } from '../src/index.js';

describe('Notes Summarizer', () => {
  describe('summarize()', () => {
    test('should return empty string for null/undefined input', () => {
      assert.strictEqual(summarize(null), '');
      assert.strictEqual(summarize(undefined), '');
      assert.strictEqual(summarize(''), '');
      assert.strictEqual(summarize('   '), '');
    });

    test('should return original text for non-string input', () => {
      assert.strictEqual(summarize(123), '');
      assert.strictEqual(summarize({}), '');
      assert.strictEqual(summarize([]), '');
    });

    test('should return single sentence as-is', () => {
      const text = 'This is a single sentence.';
      assert.strictEqual(summarize(text, 3), text);
    });

    test('should return all sentences if fewer than requested', () => {
      const text = 'First sentence. Second sentence.';
      const result = summarize(text, 5);
      assert.ok(result.includes('First sentence'));
      assert.ok(result.includes('Second sentence'));
    });

    test('should summarize long text to specified sentence count', () => {
      const longText = `
        The quick brown fox jumps over the lazy dog. 
        This is a common pangram used for typing practice.
        It contains all letters of the English alphabet.
        Foxes are wild animals that belong to the dog family.
        They are known for their cunning and adaptability.
        Many cultures have stories about clever foxes.
        The phrase "sly as a fox" comes from their reputation.
        Foxes can be found in various habitats worldwide.
        They are omnivores and eat both plants and animals.
        In conclusion, foxes are fascinating creatures.
      `;

      const summary = summarize(longText, 3);
      const sentenceCount = summary.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
      assert.strictEqual(sentenceCount, 3);
    });

    test('should prioritize sentences with frequent words', () => {
      const text = `
        Apples are delicious fruits. 
        Many people enjoy eating apples.
        Apples can be red, green, or yellow.
        Bananas are also popular fruits.
        The apple tree produces sweet apples.
        Some apples are used to make apple pie.
      `;

      const summary = summarize(text, 2);
      // Should include sentences with "apples" (appears multiple times)
      assert.ok(summary.toLowerCase().includes('apple'));
      assert.strictEqual(summary.split(/[.!?]+/).filter(s => s.trim().length > 0).length, 2);
    });

    test('should handle text with no punctuation', () => {
      const text = 'This is just a long run-on sentence without any punctuation marks';
      const result = summarize(text, 1);
      assert.strictEqual(result, text);
    });

    test('should handle mixed case and extra whitespace', () => {
      const text = '  FIRST SENTENCE IN UPPERCASE.   Second sentence in lowercase.   Third sentence.  ';
      const result = summarize(text, 2);
      // Check that result contains sentences with preserved case
      assert.ok(result.includes('FIRST SENTENCE') || result.includes('Third sentence'));
      // Check that we get exactly 2 sentences
      const sentenceCount = result.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
      assert.strictEqual(sentenceCount, 2);
      // Check that result doesn't have excessive whitespace
      assert.ok(!result.includes('   '));
    });
  });

  describe('extractKeywords()', () => {
    test('should return empty array for empty input', () => {
      const result = extractKeywords('');
      assert.deepStrictEqual(result, []);
    });

    test('should return keywords from text', () => {
      const text = 'JavaScript is a programming language. JavaScript is used for web development. Many developers love JavaScript.';
      const keywords = extractKeywords(text, 3);
      
      assert.ok(keywords.length <= 3);
      assert.ok(keywords.includes('javascript'));
    });

    test('should respect keyword count limit', () => {
      const text = 'apple banana cherry date elderberry fig grape honeydew';
      const keywords = extractKeywords(text, 3);
      assert.strictEqual(keywords.length, 3);
    });

    test('should exclude common stop words', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const keywords = extractKeywords(text, 5);
      // Should not include common words like 'the', 'over', etc.
      assert.ok(!keywords.includes('the'));
      assert.ok(!keywords.includes('over'));
    });

    test('should handle case insensitivity', () => {
      const text = 'JavaScript javascript JAVASCRIPT';
      const keywords = extractKeywords(text, 2);
      // All variations should be treated as same word
      assert.ok(keywords.includes('javascript'));
    });
  });

  describe('Integration tests', () => {
    test('summarize and extract keywords should work together', () => {
      const note = `
        Machine learning is a subset of artificial intelligence.
        It focuses on algorithms that learn from data.
        Deep learning uses neural networks with many layers.
        These techniques power modern AI applications.
        Python is the most popular language for machine learning.
        TensorFlow and PyTorch are popular frameworks.
      `;

      const summary = summarize(note, 2);
      const keywords = extractKeywords(note, 4);

      assert.ok(summary.length > 0);
      assert.ok(keywords.length > 0);
      assert.ok(keywords.some(k => ['learning', 'machine', 'neural', 'python', 'tensorflow', 'pytorch'].includes(k.toLowerCase())));
    });

    test('should handle very short text gracefully', () => {
      const text = 'Short.';
      const summary = summarize(text, 2);
      const keywords = extractKeywords(text, 3);
      
      assert.strictEqual(summary, 'Short.');
      assert.deepStrictEqual(keywords, []);
    });
  });
});