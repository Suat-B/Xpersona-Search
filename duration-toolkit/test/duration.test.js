import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseDuration, formatDuration } from '../src/index.js';

describe('parseDuration', () => {
  test('parses milliseconds', () => {
    assert.strictEqual(parseDuration('500ms'), 500);
    assert.strictEqual(parseDuration('1000ms'), 1000);
    assert.strictEqual(parseDuration('1ms'), 1);
  });

  test('parses seconds', () => {
    assert.strictEqual(parseDuration('1s'), 1000);
    assert.strictEqual(parseDuration('5s'), 5000);
    assert.strictEqual(parseDuration('30s'), 30000);
  });

  test('parses minutes', () => {
    assert.strictEqual(parseDuration('1m'), 60000);
    assert.strictEqual(parseDuration('5m'), 300000);
    assert.strictEqual(parseDuration('30m'), 1800000);
  });

  test('parses hours', () => {
    assert.strictEqual(parseDuration('1h'), 3600000);
    assert.strictEqual(parseDuration('2h'), 7200000);
    assert.strictEqual(parseDuration('12h'), 43200000);
  });

  test('parses days', () => {
    assert.strictEqual(parseDuration('1d'), 86400000);
    assert.strictEqual(parseDuration('2d'), 172800000);
    assert.strictEqual(parseDuration('7d'), 604800000);
  });

  test('parses compound durations', () => {
    assert.strictEqual(parseDuration('1h 30m'), 5400000);
    assert.strictEqual(parseDuration('2d 3h'), 183600000);
    assert.strictEqual(parseDuration('1h 30m 45s'), 5445000);
    assert.strictEqual(parseDuration('1d 12h 30m'), 131400000);
    assert.strictEqual(parseDuration('5m 30s'), 330000);
  });

  test('handles extra whitespace', () => {
    assert.strictEqual(parseDuration('  1h  30m  '), 5400000);
    assert.strictEqual(parseDuration('2d\t3h'), 183600000);
    assert.strictEqual(parseDuration('1h\n30m'), 5400000);
  });

  test('handles decimal values', () => {
    assert.strictEqual(parseDuration('1.5h'), 5400000);
    assert.strictEqual(parseDuration('0.5m'), 30000);
    assert.strictEqual(parseDuration('2.5s'), 2500);
    assert.strictEqual(parseDuration('1.5d'), 129600000);
  });

  test('throws on invalid input', () => {
    assert.throws(() => parseDuration(''), /Empty duration string/);
    assert.throws(() => parseDuration('   '), /Empty duration string/);
    assert.throws(() => parseDuration('invalid'), /Invalid duration format/);
    assert.throws(() => parseDuration('1x'), /Invalid duration format/);
    assert.throws(() => parseDuration('abc123'), /Invalid duration format/);
    assert.throws(() => parseDuration(null), /Input must be a string/);
    assert.throws(() => parseDuration(123), /Input must be a string/);
  });

  test('handles mixed case units', () => {
    assert.strictEqual(parseDuration('1H'), 3600000);
    assert.strictEqual(parseDuration('2M'), 120000);
    assert.strictEqual(parseDuration('3S'), 3000);
    assert.strictEqual(parseDuration('4D'), 345600000);
    assert.strictEqual(parseDuration('1h 30M'), 5400000);
  });
});

describe('formatDuration', () => {
  test('formats milliseconds', () => {
    assert.strictEqual(formatDuration(500), '500ms');
    assert.strictEqual(formatDuration(999), '999ms');
  });

  test('formats seconds boundary', () => {
    assert.strictEqual(formatDuration(1000), '1s');
  });

  test('formats seconds', () => {
    assert.strictEqual(formatDuration(5000), '5s');
    assert.strictEqual(formatDuration(30000), '30s');
    assert.strictEqual(formatDuration(65000), '1m 5s');
  });

  test('formats minutes', () => {
    assert.strictEqual(formatDuration(60000), '1m');
    assert.strictEqual(formatDuration(300000), '5m');
    assert.strictEqual(formatDuration(1800000), '30m');
    assert.strictEqual(formatDuration(3600000), '1h');
  });

  test('formats hours', () => {
    assert.strictEqual(formatDuration(3600000), '1h');
    assert.strictEqual(formatDuration(7200000), '2h');
    assert.strictEqual(formatDuration(43200000), '12h');
    assert.strictEqual(formatDuration(86400000), '1d');
  });

  test('formats days', () => {
    assert.strictEqual(formatDuration(86400000), '1d');
    assert.strictEqual(formatDuration(172800000), '2d');
    assert.strictEqual(formatDuration(604800000), '7d');
  });

  test('formats complex durations', () => {
    assert.strictEqual(formatDuration(5400000), '1h 30m');
    assert.strictEqual(formatDuration(183600000), '2d 3h');
    assert.strictEqual(formatDuration(5445000), '1h 30m 45s');
    assert.strictEqual(formatDuration(131400000), '1d 12h 30m');
    assert.strictEqual(formatDuration(330000), '5m 30s');
  });

  test('formats zero', () => {
    assert.strictEqual(formatDuration(0), '0ms');
  });

  test('throws on invalid input', () => {
    assert.throws(() => formatDuration(-1), /Invalid milliseconds value/);
    assert.throws(() => formatDuration(NaN), /Invalid milliseconds value/);
    assert.throws(() => formatDuration('123'), /Invalid milliseconds value/);
    assert.throws(() => formatDuration(null), /Invalid milliseconds value/);
  });

  test('round-trip consistency', () => {
    const testCases = [
      '1h 30m',
      '2d 3h 15m',
      '5m 30s 500ms',
      '1d 12h',
      '3h 45m 30s',
      '1.5h',
      '0.5d'
    ];

    for (const input of testCases) {
      const parsed = parseDuration(input);
      const formatted = formatDuration(parsed);
      // The formatted version might not exactly match input due to normalization
      // but should parse back to the same value
      assert.strictEqual(parseDuration(formatted), parsed, 
        `Round-trip failed for "${input}" -> "${formatted}"`);
    }
  });
});

describe('integration', () => {
  test('parse and format work together', () => {
    const durations = ['1h', '30m', '2d', '1h 30m', '5m 30s', '1d 12h 30m'];
    
    for (const input of durations) {
      const ms = parseDuration(input);
      const output = formatDuration(ms);
      assert.strictEqual(parseDuration(output), ms, 
        `Integration failed: "${input}" -> ${ms}ms -> "${output}"`);
    }
  });
});