import type Monaco from 'monaco-editor';

export function registerPythonLanguage(monaco: Monaco): void {
  monaco.languages.registerCompletionItemProvider('python', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      
      const suggestions = [
        { label: 'class', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'class ', range, detail: 'Define a class' },
        { label: 'def', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'def ', range, detail: 'Define a function' },
        { label: 'if', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'if ', range, detail: 'Conditional statement' },
        { label: 'elif', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'elif ', range, detail: 'Else if' },
        { label: 'else', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'else:', range, detail: 'Else clause' },
        { label: 'for', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'for ', range, detail: 'For loop' },
        { label: 'while', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'while ', range, detail: 'While loop' },
        { label: 'return', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'return ', range, detail: 'Return value' },
        { label: 'import', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'import ', range, detail: 'Import module' },
        { label: 'from', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'from ', range, detail: 'Import from module' },
        { label: 'as', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'as ', range, detail: 'Alias' },
        { label: 'in', kind: monaco.languages.CompletionItemKind.Keyword, insertText: ' in ', range, detail: 'Membership test' },
        { label: 'True', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'True', range, detail: 'Boolean true' },
        { label: 'False', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'False', range, detail: 'Boolean false' },
        { label: 'None', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'None', range, detail: 'None value' },
        { label: 'pass', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'pass', range, detail: 'No operation' },
        { label: 'break', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'break', range, detail: 'Exit loop' },
        { label: 'continue', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'continue', range, detail: 'Skip to next iteration' },
        
        { label: '__init__', kind: monaco.languages.CompletionItemKind.Function, insertText: 'def __init__(self, config):', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Constructor method' },
        
        { label: 'print', kind: monaco.languages.CompletionItemKind.Function, insertText: 'print()', range, detail: 'Print to console' },
        { label: 'len', kind: monaco.languages.CompletionItemKind.Function, insertText: 'len()', range, detail: 'Get length' },
        { label: 'range', kind: monaco.languages.CompletionItemKind.Function, insertText: 'range()', range, detail: 'Generate range' },
        { label: 'int', kind: monaco.languages.CompletionItemKind.Function, insertText: 'int()', range, detail: 'Convert to integer' },
        { label: 'float', kind: monaco.languages.CompletionItemKind.Function, insertText: 'float()', range, detail: 'Convert to float' },
        { label: 'str', kind: monaco.languages.CompletionItemKind.Function, insertText: 'str()', range, detail: 'Convert to string' },
        { label: 'bool', kind: monaco.languages.CompletionItemKind.Function, insertText: 'bool()', range, detail: 'Convert to boolean' },
        { label: 'list', kind: monaco.languages.CompletionItemKind.Function, insertText: 'list()', range, detail: 'Create list' },
        { label: 'dict', kind: monaco.languages.CompletionItemKind.Function, insertText: 'dict()', range, detail: 'Create dictionary' },
        { label: 'min', kind: monaco.languages.CompletionItemKind.Function, insertText: 'min()', range, detail: 'Get minimum' },
        { label: 'max', kind: monaco.languages.CompletionItemKind.Function, insertText: 'max()', range, detail: 'Get maximum' },
        { label: 'sum', kind: monaco.languages.CompletionItemKind.Function, insertText: 'sum()', range, detail: 'Sum values' },
        { label: 'abs', kind: monaco.languages.CompletionItemKind.Function, insertText: 'abs()', range, detail: 'Absolute value' },
        { label: 'round', kind: monaco.languages.CompletionItemKind.Function, insertText: 'round()', range, detail: 'Round number' },
        
        { label: 'ctx.get_balance()', kind: monaco.languages.CompletionItemKind.Method, insertText: 'ctx.get_balance()', range, detail: 'Get current balance', documentation: 'Returns current account balance as a float.' },
        { label: 'ctx.get_history(n)', kind: monaco.languages.CompletionItemKind.Method, insertText: 'ctx.get_history(${1:50})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Get last n round results', documentation: 'Returns a list of last n round results. Each result has: result, win, payout, bet_amount.' },
        { label: 'ctx.calculate_odds(target, condition)', kind: monaco.languages.CompletionItemKind.Method, insertText: 'ctx.calculate_odds(${1:50}, ${2:"over"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Calculate odds for a bet', documentation: 'Calculate theoretical odds for a dice bet with given target and condition.' },
        { label: 'ctx.notify(message)', kind: monaco.languages.CompletionItemKind.Method, insertText: 'ctx.notify(${1:"message"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Log a message', documentation: 'Log a message to the execution log.' },
        { label: 'ctx.get_limits()', kind: monaco.languages.CompletionItemKind.Method, insertText: 'ctx.get_limits()', range, detail: 'Get dice limits', documentation: 'Returns dict: min_bet, max_bet, house_edge, target_min, target_max.' },
        
        { label: 'ctx.round_number', kind: monaco.languages.CompletionItemKind.Property, insertText: 'ctx.round_number', range, detail: 'Current round number (1-based)', documentation: 'Property: Current round index starting from 1.' },
        { label: 'ctx.initial_balance', kind: monaco.languages.CompletionItemKind.Property, insertText: 'ctx.initial_balance', range, detail: 'Initial session balance', documentation: 'Property: Starting balance for this session.' },
        { label: 'ctx.session_pnl', kind: monaco.languages.CompletionItemKind.Property, insertText: 'ctx.session_pnl', range, detail: 'Session profit/loss', documentation: 'Property: Current session profit/loss.' },
        
        { label: 'BetDecision', kind: monaco.languages.CompletionItemKind.Class, insertText: 'BetDecision(${1:amount}, ${2:target}, ${3:"over"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Create a bet decision', documentation: 'Create a bet decision to place a dice bet.\n\nParameters:\n- amount: Credits to bet\n- target: 0-99.99\n- condition: "over" or "under"' },
        { label: 'BetDecision.stop()', kind: monaco.languages.CompletionItemKind.Method, insertText: 'BetDecision.stop(${1:"reason"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Stop strategy', documentation: 'Stop strategy execution with an optional reason.' },
        { label: 'RoundResult', kind: monaco.languages.CompletionItemKind.Class, insertText: 'RoundResult(${1:result}, ${2:win}, ${3:payout}, ${4:balance})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Round result object', documentation: 'Result of a dice round.\n- result: dice value (0-100)\n- win: boolean\n- payout: credits won\n- balance: new balance' },
      ];
      
      return { suggestions };
    }
  });

  monaco.languages.registerHoverProvider('python', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return;
      
      const hoverTexts: Record<string, string> = {
        'ctx': '**Strategy Context**\nProvides methods and properties for strategy execution.\n\nMethods:\n- `get_balance()`: Current balance\n- `get_history(n)`: Last n results\n- `calculate_odds(target, condition)`: Calculate odds\n- `notify(msg)`: Log message\n- `get_limits()`: Game limits\n\nProperties:\n- `round_number`: Current round\n- `initial_balance`: Starting balance\n- `session_pnl`: Session P&L',
        'BetDecision': '**Bet Decision**\nCreates a bet decision to place a bet.\n\n**Parameters:**\n- `amount`: Credits to bet (1-10000)\n- `target`: Target value (0-99.99)\n- `condition`: `"over"` or `"under"`',
        'RoundResult': '**Round Result**\nContains the result of a completed round.\n\n**Properties:**\n- `result`: Dice value (0-100)\n- `win`: Boolean (win/loss)\n- `payout`: Credits won\n- `balance`: New balance',
        'self': 'Reference to the current strategy instance.',
      };
      
      const text = hoverTexts[word.word];
      if (!text) return;
      
      return {
        range: word,
        contents: [{ value: text, isTrusted: true, supportHtml: true }]
      };
    }
  });

  monaco.languages.registerDocumentFormattingEditProvider('python', {
    provideDocumentFormattingEdits: (model) => {
      const code = model.getValue();
      const formatted = formatPythonCode(code);
      
      return [
        {
          range: model.getFullModelRange(),
          text: formatted
        }
      ];
    }
  });
}

function formatPythonCode(code: string): string {
  const lines = code.split('\n');
  let indentLevel = 0;
  const formatted: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '') {
      formatted.push('');
      continue;
    }
    
    const dedentKeywords = ['elif', 'else:', 'except:', 'finally:', 'except ', 'finally '];
    const shouldDedent = dedentKeywords.some(kw => trimmed.startsWith(kw));
    
    if (shouldDedent) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    const indent = '    '.repeat(indentLevel);
    formatted.push(indent + trimmed);
    
    const indentKeywords = ['def ', 'class ', 'if ', 'elif ', 'else:', 'for ', 'while ', 'try:', 'except', 'finally:', 'with '];
    const shouldIndent = indentKeywords.some(kw => trimmed.startsWith(kw)) || trimmed.endsWith(':');
    
    if (shouldIndent) {
      indentLevel++;
    }
  }
  
  return formatted.join('\n');
}
