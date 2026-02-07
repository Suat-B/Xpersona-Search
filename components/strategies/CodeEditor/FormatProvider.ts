import type Monaco from 'monaco-editor';

export function registerFormatProvider(monaco: Monaco): void {
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
    
    const dedentKeywords = ['elif', 'else:', 'except:', 'finally:'];
    if (dedentKeywords.some(kw => trimmed.startsWith(kw))) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    const indent = '    '.repeat(indentLevel);
    formatted.push(indent + trimmed);
    
    const indentKeywords = ['def ', 'class ', 'if ', 'elif ', 'else:', 'for ', 'while ', 'try:', 'except:', 'finally:', 'with '];
    const shouldIndent = indentKeywords.some(kw => trimmed.startsWith(kw)) || trimmed.endsWith(':');
    if (shouldIndent) {
      indentLevel++;
    }
  }
  
  return formatted.join('\n');
}
