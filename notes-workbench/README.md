# Notes Workbench

A tiny notes summarizer that helps you create concise summaries of your notes.

## Features

- Simple text summarization
- Configurable summary length
- Easy to use API

## Usage

```javascript
import { summarize } from './src/index.js';
import { extractKeywords } from './src/summary.js';

const note = "Your long note text here...";
const summary = summarize(note, 3); // 3 sentences
const keywords = extractKeywords(note, 5); // 5 keywords
```

## Testing

Run tests with:

```bash
npm test
```

## Project Structure

- `src/index.js` - Main summarization function
- `src/summary.js` - Helper utilities for text analysis
- `test/index.test.js` - Test suite
- `docs/plan.md` - Project planning document