import type Monaco from 'monaco-editor';

export function configureMonaco(monaco: Monaco): void {
  monaco.editor.defineTheme('xpersona-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: 'c586c0' },
      { token: 'keyword.operator', foreground: 'c586c0' },
      
      { token: 'string', foreground: '98c379' },
      { token: 'string.quote', foreground: '98c379' },
      
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'comment.doc', foreground: '5c6370', fontStyle: 'italic' },
      
      { token: 'entity.name.function', foreground: '61afef' },
      { token: 'entity.name.type.class', foreground: 'e5c07b', fontStyle: 'bold' },
      { token: 'entity.name.type', foreground: 'e5c07b' },
      
      { token: 'constant.numeric', foreground: 'd19a66' },
      { token: 'constant.language', foreground: '56b6c2' },
      { token: 'constant.language.boolean', foreground: '56b6c2' },
      { token: 'constant.language.none', foreground: '56b6c2' },
      
      { token: 'variable', foreground: 'e06c75' },
      { token: 'variable.language', foreground: 'e06c75' },
      { token: 'variable.object', foreground: 'abb2bf' },
      { token: 'variable.parameter', foreground: 'd19a66' },
      
      { token: 'support.function', foreground: '61afef' },
      { token: 'support.function.magic', foreground: 'c678dd' },
      
      { token: 'support.class', foreground: 'e5c07b' },
      { token: 'support.type', foreground: 'e5c07b' },
      
      { token: 'meta.decorator', foreground: 'c678dd' },
      { token: 'meta.function-call', foreground: '61afef' },
    ],
    colors: {
      'editor.background': '#111111',
      'editor.foreground': '#abb2bf',
      
      'editor.lineHighlightBackground': '#1e1e1e',
      'editor.lineHighlightBorder': '#1e1e1e',
      
      'editorCursor.foreground': '#f43f5e',
      'editorCursor.background': '#111111',
      
      'editor.selectionBackground': '#f43f5e33',
      'editor.selectionForeground': '#abb2bf',
      'editor.inactiveSelectionBackground': '#f43f5e1a',
      
      'editor.whitespace': '#282c34',
      'editor.indentGuide.background': '#282c34',
      'editor.indentGuide.activeBackground': '#3b4048',
      
      'editorLineNumber.foreground': '#4b5263',
      'editorLineNumber.activeForeground': '#f43f5e',
      
      'editorRuler.foreground': '#282c34',
      
      'editorCodeLens.foreground': '#4b5263',
      'editorBracketMatch.background': '#f43f5e33',
      'editorBracketMatch.border': '#f43f5e',
      
      'editorBracketPairGuide.activeBackground1': '#f43f5e1a',
      'editorBracketPairGuide.activeBackground2': '#f43f5e1a',
      'editorBracketPairGuide.activeBackground3': '#f43f5e1a',
      'editorBracketPairGuide.activeBackground4': '#f43f5e1a',
      'editorBracketPairGuide.activeBackground5': '#f43f5e1a',
      'editorBracketPairGuide.activeBackground6': '#f43f5e1a',
      
      'editorOverviewRuler.border': '#282c34',
      
      'editorError.foreground': '#f43f5e',
      'editorError.background': '#00000000',
      'editorWarning.foreground': '#e5c07b',
      'editorWarning.background': '#00000000',
      'editorInfo.foreground': '#61afef',
      'editorInfo.background': '#00000000',
      
      'minimap.background': '#111111',
      'minimap.selectionHighlight': '#f43f5e33',
      'minimap.errorHighlight': '#f43f5e',
      'minimap.warningHighlight': '#e5c07b',
      'minimapInfo.foreground': '#61afef',
    }
  });
}

export function getEditorOptions() {
  return {
    readOnly: false,
    fontSize: 14,
    fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
    lineHeight: 24,
    letterSpacing: 0.5,
    
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    
    minimap: {
      enabled: true,
      size: 'proportional',
      showSlider: 'mouseover',
      renderCharacters: true,
      maxColumn: 80
    },
    
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    cursorStyle: 'line',
    cursorWidth: 2,
    
    wordWrap: 'on',
    wordWrapColumn: 100,
    wordWrapMinified: true,
    
    wrappingIndent: 4,
    wrappingStrategy: 'advanced',
    
    automaticLayout: true,
    
    tabSize: 4,
    insertSpaces: true,
    detectIndentation: true,
    
    renderWhitespace: 'selection',
    renderControlCharacters: false,
    renderLineHighlight: 'all',
    renderLineHighlightOnlyWhenFocus: false,
    
    bracketPairColorization: {
      enabled: true,
      independentColorPoolPerBracketType: true
    },
    
    guides: {
      bracketPairs: true,
      bracketPairsHorizontal: false,
      indentation: true,
      highlightActiveIndentation: true
    },
    
    folding: true,
    foldingHighlight: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'always',
    foldingHighlightColor: { foreground: '#f43f5e' },
    
    formatOnPaste: true,
    formatOnType: true,
    trimAutoWhitespace: 'auto',
    
    suggest: {
      showKeywords: true,
      showSnippets: true,
      showStatusBar: true,
      showInlineDetails: true,
      showWords: false
    },
    
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false
    },
    
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    
    parameterHints: {
      enabled: true,
      cycle: true
    },
    
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoSurround: 'languageDefined',
    
    autoIndent: 'full',
    
    suggestOnTriggerCharacters: true,
    
    maxTokenizationLineLength: 20000
  } as const;
}

export function getCompletionItemKind(): {
  class: number;
  interface: number;
  struct: number;
  enum: number;
  method: number;
  function: number;
  property: number;
  variable: number;
  field: number;
  constructor: number;
} {
  return {
    class: 5,
    interface: 7,
    struct: 11,
    enum: 13,
    method: 2,
    function: 3,
    property: 10,
    variable: 6,
    field: 9,
    constructor: 4
  };
}
