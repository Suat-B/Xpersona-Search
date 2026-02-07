

export enum ErrorType {
  SYNTAX_ERROR = 'syntax_error',
  RUNTIME_ERROR = 'runtime_error',
  SECURITY_VIOLATION = 'security_violation',
  TIMEOUT_ERROR = 'timeout_error',
  MEMORY_ERROR = 'memory_error',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
  codeSnippet?: string;
}

export class PythonErrorHandler {
  
  parseTraceback(traceback: string): { line: number; column: number; message: string } {
    const lineMatch = traceback.match(/line (\d+)/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : 0;
    
    const errorMatch = traceback.match(/([A-Za-z]+Error): (.+)/);
    const message = errorMatch ? errorMatch[2] : traceback;
    
    return { line, column: 0, message };
  }

  categorizeError(error: any): ErrorType {
    const errorString = String(error);
    
    if (errorString.includes('SyntaxError')) {
      return ErrorType.SYNTAX_ERROR;
    }
    
    if (errorString.includes('Security violation') || errorString.includes('Forbidden pattern')) {
      return ErrorType.SECURITY_VIOLATION;
    }
    
    if (errorString.includes('timeout') || errorString.includes('aborted')) {
      return ErrorType.TIMEOUT_ERROR;
    }
    
    if (errorString.includes('memory') || errorString.includes('MemoryError')) {
      return ErrorType.MEMORY_ERROR;
    }
    
    if (errorString.includes('NameError') || errorString.includes('TypeError') || 
        errorString.includes('ValueError') || errorString.includes('AttributeError')) {
      return ErrorType.RUNTIME_ERROR;
    }
    
    return ErrorType.UNKNOWN_ERROR;
  }

  formatError(error: any, code: string): ErrorDetails {
    const errorType = this.categorizeError(error);
    const errorString = String(error);
    
    let line: number | undefined;
    let column: number | undefined;
    let message: string;

    if (error instanceof Error && error.message) {
      message = error.message;
    } else {
      message = errorString;
    }

    if (errorType === ErrorType.RUNTIME_ERROR || errorType === ErrorType.SYNTAX_ERROR) {
      const traceback = this.parseTraceback(errorString);
      line = traceback.line > 0 ? traceback.line : undefined;
      column = traceback.column;
      message = traceback.message || message;
    }

    const suggestion = this.getSuggestion(errorType, message);
    const codeSnippet = line !== undefined ? this.getCodeSnippet(code, line, 2) : undefined;

    return {
      type: errorType,
      message,
      line,
      column,
      suggestion,
      severity: errorType === ErrorType.VALIDATION_ERROR ? 'warning' : 'error',
      codeSnippet
    };
  }

  getSuggestion(errorType: ErrorType, context: string): string {
    const contextLower = context.toLowerCase();

    switch (errorType) {
      case ErrorType.SYNTAX_ERROR:
        if (contextLower.includes('indentation')) {
          return 'Check your indentation. Python uses consistent indentation (4 spaces recommended).';
        }
        if (contextLower.includes('unexpected eof')) {
          return 'You might be missing a closing parenthesis, bracket, or quote.';
        }
        if (contextLower.includes('invalid syntax')) {
          return 'Check for missing colons after if/for/while/def/class statements.';
        }
        return 'Check for syntax errors: missing colons, unmatched brackets, or incorrect indentation.';

      case ErrorType.RUNTIME_ERROR:
        if (contextLower.includes('nameerror')) {
          const match = context.match(/name '(\w+)'/);
          const name = match ? match[1] : 'variable';
          return `The name '${name}' is not defined. Make sure you spelled it correctly or defined it before use.`;
        }
        if (contextLower.includes('typeerror')) {
          return 'Type mismatch: you might be trying to use a number where a string is expected (or vice versa).';
        }
        if (contextLower.includes('attributeerror')) {
          const match = context.match(/'(\w+)'/);
          const name = match ? match[1] : 'object';
          return `The object '${name}' doesn't have this attribute. Check the SDK documentation for available methods.`;
        }
        if (contextLower.includes('valueerror')) {
          return 'Invalid value: check if you\'re using correct types for functions (e.g., int for numbers).';
        }
        return 'Runtime error: check variable names, types, and that all objects exist before use.';

      case ErrorType.SECURITY_VIOLATION:
        return 'Security violation: your code contains forbidden patterns (os, sys, subprocess, etc.). These are blocked for safety.';

      case ErrorType.TIMEOUT_ERROR:
        return 'Execution timeout: your strategy took too long to run. Consider optimizing your code or reducing computations.';

      case ErrorType.MEMORY_ERROR:
        return 'Memory limit exceeded: your strategy is using too much memory. Try reducing data structures or using more efficient algorithms.';

      case ErrorType.VALIDATION_ERROR:
        return 'Validation failed: check that your code includes required methods (on_round_start) and returns a BetDecision.';

      default:
        return 'An unknown error occurred. Check your code for common issues and try again.';
    }
  }

  getCodeSnippet(code: string, line: number, contextLines: number): string {
    const lines = code.split('\n');
    const startLine = Math.max(0, line - contextLines - 1);
    const endLine = Math.min(lines.length, line + contextLines);
    
    const snippet = lines.slice(startLine, endLine).map((l, idx) => {
      const lineNum = startLine + idx + 1;
      const prefix = lineNum === line ? '>>> ' : '    ';
      return `${prefix}${lineNum}: ${l}`;
    }).join('\n');
    
    return snippet;
  }

  getDetailedError(error: any, code: string): {
    type: ErrorType;
    title: string;
    message: string;
    line?: number;
    suggestion: string;
    codeSnippet?: string;
    fixExample?: string;
  } {
    const details = this.formatError(error, code);
    
    const titles: Record<ErrorType, string> = {
      [ErrorType.SYNTAX_ERROR]: 'Syntax Error',
      [ErrorType.RUNTIME_ERROR]: 'Runtime Error',
      [ErrorType.SECURITY_VIOLATION]: 'Security Violation',
      [ErrorType.TIMEOUT_ERROR]: 'Timeout Error',
      [ErrorType.MEMORY_ERROR]: 'Memory Error',
      [ErrorType.VALIDATION_ERROR]: 'Validation Error',
      [ErrorType.UNKNOWN_ERROR]: 'Unknown Error'
    };

    let fixExample: string | undefined;
    if (details.type === ErrorType.RUNTIME_ERROR && details.message.includes('NameError')) {
      const match = details.message.match(/name '(\w+)'/);
      const name = match ? match[1] : 'my_var';
      fixExample = `# Define the variable before using\n${name} = 10\nctx.get_balance()`;
    }

    if (details.type === ErrorType.SYNTAX_ERROR && details.message.includes('colon')) {
      fixExample = `# Add colon after if/for/while/def/class\nif balance > 0:\n    return BetDecision(10, 50, "over")`;
    }

    return {
      type: details.type,
      title: titles[details.type],
      message: details.message,
      line: details.line,
      suggestion: details.suggestion || '',
      codeSnippet: details.codeSnippet,
      fixExample
    };
  }
}

export default PythonErrorHandler;
