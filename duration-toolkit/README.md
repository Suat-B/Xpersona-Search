# Duration Toolkit

A simple, zero-dependency JavaScript ESM library for parsing and formatting time durations.

## Features

- Parse duration strings to milliseconds
- Format milliseconds to human-readable strings
- Support for: milliseconds (ms), seconds (s), minutes (m), hours (h), days (d)
- Handle compound durations like "1h 30m" or "2d 3h 15m"
- Case-insensitive unit parsing
- Decimal value support (e.g., "1.5h")
- No external dependencies

## Installation

This is a standalone library. Just copy the `src/index.js` file to your project.

## Usage

### parseDuration(input)

Parses a duration string and returns the total milliseconds.

```javascript
import { parseDuration } from './src/index.js';

parseDuration('1h 30m');      // 5400000
parseDuration('5s');          // 5000
parseDuration('2d');          // 172800000
parseDuration('500ms');       // 500
parseDuration('1.5h');        // 5400000
parseDuration('1h 30m 45s');  // 5445000
```

### formatDuration(ms)

Formats milliseconds to a human-readable duration string.

```javascript
import { formatDuration } from './src/index.js';

formatDuration(5400000);      // "1h 30m"
formatDuration(5000);         // "5s"
formatDuration(172800000);    // "2d"
formatDuration(500);          // "500ms"
formatDuration(5445000);      // "1h 30m 45s"
```

## Running Tests

```bash
npm test
```

This uses Node.js built-in test runner.

## API

### parseDuration(input: string): number

- **input**: Duration string with optional spaces between value and unit
- **Returns**: Total milliseconds as integer
- **Throws**: TypeError for non-string input, Error for invalid format

Supported units (case-insensitive):
- `ms` - milliseconds
- `s` - seconds  
- `m` - minutes
- `h` - hours
- `d` - days

### formatDuration(ms: number): string

- **ms**: Milliseconds to format (non-negative number)
- **Returns**: Formatted duration string with largest units first
- **Throws**: Error for invalid input (negative, NaN, non-number)

## Examples

```javascript
// Round-trip conversion
const input = '1h 30m';
const ms = parseDuration(input);  // 5400000
const output = formatDuration(ms); // "1h 30m"

// Complex durations
parseDuration('2d 3h 15m 30s'); // 183930000
formatDuration(183930000);      // "2d 3h 15m 30s"

// Decimal values
parseDuration('1.5h'); // 5400000 (1 hour 30 minutes)
parseDuration('0.5d'); // 43200000 (12 hours)
```

## License

MIT