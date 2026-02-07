import type Monaco from 'monaco-editor';

export function registerCompletionProvider(monaco: Monaco): void {
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
        { label: 'get_balance', kind: monaco.languages.CompletionItemKind.Function, insertText: 'get_balance()', range, detail: 'Returns current balance', documentation: 'Get current account balance as a float.' },
        { label: 'get_history', kind: monaco.languages.CompletionItemKind.Function, insertText: 'get_history(${1:50})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Get last n round results', documentation: 'Returns a list of last n round results. Each result has: result, win, payout, bet_amount.' },
        { label: 'calculate_odds', kind: monaco.languages.CompletionItemKind.Function, insertText: 'calculate_odds(${1:target}, ${2:"over"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Calculate odds for a bet', documentation: 'Calculate theoretical odds for a dice bet with given target and condition.' },
        { label: 'notify', kind: monaco.languages.CompletionItemKind.Function, insertText: 'notify(${1:"message"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Log a message', documentation: 'Send notification message to execution log.' },
        { label: 'get_limits', kind: monaco.languages.CompletionItemKind.Function, insertText: 'get_limits()', range, detail: 'Get dice limits', documentation: 'Returns dict: min_bet, max_bet, house_edge, target_min, target_max.' },
        { label: 'round_number', kind: monaco.languages.CompletionItemKind.Property, insertText: 'round_number', range, detail: 'Current round number (1-based)', documentation: 'Property: Current round index starting from 1.' },
        { label: 'initial_balance', kind: monaco.languages.CompletionItemKind.Property, insertText: 'initial_balance', range, detail: 'Initial session balance', documentation: 'Property: Starting balance for this session.' },
        { label: 'session_pnl', kind: monaco.languages.CompletionItemKind.Property, insertText: 'session_pnl', range, detail: 'Session profit/loss', documentation: 'Property: Current session profit/loss.' },
        { label: 'BetDecision', kind: monaco.languages.CompletionItemKind.Class, insertText: 'BetDecision(${1:amount}, ${2:target}, ${3:"over"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Create a bet decision', documentation: 'Create a bet decision to place a dice bet.\n\nParameters:\n- amount: Credits to bet\n- target: 0-99.99\n- condition: "over" or "under"' },
        { label: 'BetDecision.stop', kind: monaco.languages.CompletionItemKind.Method, insertText: 'BetDecision.stop(${1:"reason"})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Stop strategy', documentation: 'Stop strategy execution with an optional reason.' },
        { label: 'RoundResult', kind: monaco.languages.CompletionItemKind.Class, insertText: 'RoundResult(${1:result}, ${2:win}, ${3:payout}, ${4:balance})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Round result object', documentation: 'Result of a dice round.\n- result: dice value (0-100)\n- win: boolean\n- payout: credits won\n- balance: new balance' },
        { label: 'import', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'import ${1:module}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Import module', documentation: 'Import a Python module. Safe: math, statistics, random.' },
        { label: 'from', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'from ${1:module} import ${2:name}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail: 'Import from module', documentation: 'Import specific items from a module.' },
      ];
      
      return { suggestions };
    }
  });
}
