export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  rule?: string;
}

export interface StructureIssue {
  line: number;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationResponse {
  valid: boolean;
  errors: SyntaxError[];
  warnings: SyntaxError[];
  structureIssues: StructureIssue[];
  sdkWarnings: string[];
}

export class LiveValidator {
  private static readonly MAX_CODE_LENGTH = 30_000;

  private static readonly DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> = [
    { pattern: /\bimport\s+os\b/, message: "Dangerous import 'os' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+os\b/, message: "Dangerous import 'os' not allowed", severity: 'error' },
    { pattern: /\bimport\s+sys\b/, message: "Dangerous import 'sys' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+sys\b/, message: "Dangerous import 'sys' not allowed", severity: 'error' },
    { pattern: /\bimport\s+subprocess\b/, message: "Dangerous import 'subprocess' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+subprocess\b/, message: "Dangerous import 'subprocess' not allowed", severity: 'error' },
    { pattern: /\bimport\s+socket\b/, message: "Dangerous import 'socket' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+socket\b/, message: "Dangerous import 'socket' not allowed", severity: 'error' },
    { pattern: /\bimport\s+requests\b/, message: "Dangerous import 'requests' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+requests\b/, message: "Dangerous import 'requests' not allowed", severity: 'error' },
    { pattern: /\bimport\s+urllib\b/, message: "Dangerous import 'urllib' not allowed", severity: 'error' },
    { pattern: /\bfrom\s+urllib\b/, message: "Dangerous import 'urllib' not allowed", severity: 'error' },
    { pattern: /__import__\s*\(/, message: "Dangerous __import__ not allowed", severity: 'error' },
    { pattern: /\beval\s*\(/, message: "Dangerous eval() not allowed", severity: 'error' },
    { pattern: /\bexec\s*\(/, message: "Dangerous exec() not allowed", severity: 'error' },
    { pattern: /\bcompile\s*\(/, message: "Dangerous compile() not allowed", severity: 'error' },
    { pattern: /\bopen\s*\(/, message: "File open() not allowed", severity: 'error' },
    { pattern: /\bfile\s*\(/, message: "file() not allowed", severity: 'error' },
  ];

  private static readonly ALLOWED_IMPORTS = [
    'math', 'statistics', 'random', 'json', 'typing'
  ];

  validate(code: string): ValidationResponse {
    const errors: SyntaxError[] = [];
    const warnings: SyntaxError[] = [];
    const structureIssues: StructureIssue[] = [];
    const sdkWarnings: string[] = [];

    if (!code || !code.trim()) {
      return {
        valid: false,
        errors: [{ line: 1, column: 0, message: 'Code is empty', severity: 'error' }],
        warnings,
        structureIssues,
        sdkWarnings
      };
    }

    if (code.length > LiveValidator.MAX_CODE_LENGTH) {
      errors.push({
        line: 1,
        column: 0,
        message: `Code exceeds maximum length (${LiveValidator.MAX_CODE_LENGTH} characters)`,
        severity: 'error'
      });
    }

    const syntaxErrors = this.checkSyntax(code);
    errors.push(...syntaxErrors);

    const securityViolations = this.checkSecurity(code);
    securityViolations.forEach(violation => {
      const line = this.findLineNumber(code, violation.pattern);
      errors.push({
        line,
        column: 0,
        message: violation.message,
        severity: violation.severity,
        rule: 'security'
      });
    });

    const structureChecks = this.checkStructure(code);
    structureIssues.push(...structureChecks);

    const sdkChecks = this.checkSDKUsage(code);
    sdkWarnings.push(...sdkChecks);

    return {
      valid: errors.length === 0 && structureIssues.filter(i => i.severity === 'error').length === 0,
      errors,
      warnings,
      structureIssues,
      sdkWarnings
    };
  }

  checkSyntax(code: string): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        return;
      }

      const colonNeededPatterns = [
        /^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b/,
        /^\s*(else|except|finally):?$/
      ];

      for (const pattern of colonNeededPatterns) {
        if (pattern.test(trimmedLine) && !trimmedLine.endsWith(':')) {
          errors.push({
            line: lineNum,
            column: trimmedLine.length + 1,
            message: 'Missing colon at end of statement',
            severity: 'error',
            rule: 'syntax:colon'
          });
        }
      }

      const bracketCounts = {
        '(': (line.match(/\(/g) || []).length,
        ')': (line.match(/\)/g) || []).length,
        '[': (line.match(/\[/g) || []).length,
        ']': (line.match(/\]/g) || []).length,
        '{': (line.match(/\{/g) || []).length,
        '}': (line.match(/\}/g) || []).length
      };

      if (bracketCounts['('] !== bracketCounts[')']) {
        errors.push({
          line: lineNum,
          column: 0,
          message: 'Unbalanced parentheses',
          severity: 'error',
          rule: 'syntax:parentheses'
        });
      }

      if (bracketCounts['['] !== bracketCounts[']']) {
        errors.push({
          line: lineNum,
          column: 0,
          message: 'Unbalanced brackets',
          severity: 'error',
          rule: 'syntax:brackets'
        });
      }

      if (bracketCounts['{'] !== bracketCounts['}']) {
        errors.push({
          line: lineNum,
          column: 0,
          message: 'Unbalanced braces',
          severity: 'error',
          rule: 'syntax:braces'
        });
      }
    });

    return errors;
  }

  checkSecurity(code: string): Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> {
    const violations: Array<{ pattern: RegExp; message: string; severity: 'error' | 'warning' }> = [];

    for (const { pattern, message, severity } of LiveValidator.DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        violations.push({ pattern, message, severity });
      }
    }

    return violations;
  }

  checkStructure(code: string): StructureIssue[] {
    const issues: StructureIssue[] = [];
    const lines = code.split('\n');

    const hasOnRoundStart = code.includes('def on_round_start(');
    const hasOnRoundComplete = code.includes('def on_round_complete(');
    const hasShouldStop = code.includes('def should_stop(');
    const hasClass = code.includes('class ');

    if (!hasClass) {
      issues.push({
        line: 1,
        message: 'Strategy must define a class',
        severity: 'error',
        suggestion: 'Add a class definition: class Strategy:'
      });
    }

    if (!hasOnRoundStart) {
      issues.push({
        line: 1,
        message: 'Strategy must implement on_round_start method',
        severity: 'error',
        suggestion: 'Add: def on_round_start(self, ctx): return BetDecision(amount, target, condition)'
      });
    }

    if (!code.includes('BetDecision')) {
      issues.push({
        line: 1,
        message: 'Strategy should return or use BetDecision',
        severity: 'warning',
        suggestion: 'Use: return BetDecision(amount, target, "over"|"under")'
      });
    }

    if (hasClass && !hasOnRoundStart) {
      lines.forEach((line, index) => {
        if (line.includes('class ')) {
          issues.push({
            line: index + 1,
            message: 'Strategy class missing on_round_start method',
            severity: 'error',
            suggestion: 'Add def on_round_start(self, ctx): inside your class'
          });
        }
      });
    }

    if (hasOnRoundComplete && code.includes('def on_round_complete(self, ctx):')) {
      lines.forEach((line, index) => {
        if (line.includes('def on_round_complete(') && !line.includes('result')) {
          issues.push({
            line: index + 1,
            message: 'on_round_complete should accept result parameter',
            severity: 'warning',
            suggestion: 'Change to: def on_round_complete(self, ctx, result):'
          });
        }
      });
    }

    const hasInit = code.includes('def __init__(');
    if (hasClass && !hasInit) {
      issues.push({
        line: lines.findIndex(l => l.includes('class ')) + 1,
        message: 'Strategy class should have __init__ method for configuration',
        severity: 'warning',
        suggestion: 'Add: def __init__(self, config):'
      });
    }

    return issues;
  }

  checkSDKUsage(code: string): string[] {
    const warnings: string[] = [];

    const invalidContextUsage = code.match(/ctx\.\w+/g) || [];
    const validMethods = [
      'get_balance', 'get_history', 'notify', 'calculate_odds',
      'get_limits', 'last_result'
    ];

    invalidContextUsage.forEach(usage => {
      const methodName = usage.replace('ctx.', '');
      if (!validMethods.includes(methodName) && !['round_number', 'initial_balance', 'session_pnl'].includes(methodName)) {
        warnings.push(`Unknown ctx method: ${methodName}. Available: ${validMethods.join(', ')}`);
      }
    });

    if (code.includes('return ') && !code.includes('return BetDecision') && !code.includes('return BetDecision.stop')) {
      warnings.push('Return statement found but may not be returning a BetDecision. Check your returns.');
    }

    return warnings;
  }

  validateBetDecision(code: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const hasBetDecision = code.includes('BetDecision(');
    const hasStop = code.includes('BetDecision.stop(');

    if (!hasBetDecision && !hasStop) {
      issues.push('Strategy should use BetDecision to place bets or stop execution');
    }

    if (hasBetDecision) {
      const betDecisionMatches = code.match(/BetDecision\s*\(([^)]+)\)/g) || [];
      
      betDecisionMatches.forEach(match => {
        const params = match.replace(/BetDecision\s*\(|\)/g, '').split(',').map(s => s.trim());
        
        if (params.length < 3) {
          issues.push(`BetDecision requires 3 parameters (amount, target, condition), found ${params.length}`);
        }

        if (params.length >= 2) {
          const target = params[1];
          if (!isNaN(parseFloat(target))) {
            const num = parseFloat(target);
            if (num < 0 || num > 99.99) {
              issues.push(`Target ${num} is outside valid range (0-99.99)`);
            }
          }
        }

        if (params.length >= 3) {
          const condition = params[2].replace(/['"]/g, '');
          if (condition !== 'over' && condition !== 'under') {
            issues.push(`Condition must be 'over' or 'under', found: ${condition}`);
          }
        }
      });
    }

    if (hasStop) {
      const stopMatches = code.match(/BetDecision\.stop\s*\(([^)]*)\)/g) || [];
      
      stopMatches.forEach(match => {
        const reason = match.replace(/BetDecision\.stop\s*\(|\)/g, '').trim();
        if (reason === '()') {
          issues.push('BetDecision.stop() should include a reason: BetDecision.stop("reason")');
        }
      });
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  validateMethodSignatures(code: string): Array<{ method: string; issue: string }> {
    const issues: Array<{ method: string; issue: string }> = [];

    const methodPatterns = [
      {
        name: 'on_round_start',
        regex: /def\s+on_round_start\s*\([^)]*\)/,
        expectedParams: ['self', 'ctx']
      },
      {
        name: 'on_round_complete',
        regex: /def\s+on_round_complete\s*\([^)]*\)/,
        expectedParams: ['self', 'ctx', 'result']
      },
      {
        name: 'should_stop',
        regex: /def\s+should_stop\s*\([^)]*\)/,
        expectedParams: ['self', 'ctx']
      },
      {
        name: '__init__',
        regex: /def\s+__init__\s*\([^)]*\)/,
        expectedParams: ['self', 'config']
      }
    ];

    methodPatterns.forEach(method => {
      const match = code.match(method.regex);
      if (match) {
        const params = match[0]
          .replace(/def\s+\w+\s*\(|\)/g, '')
          .split(',')
          .map(s => s.trim());
        
        const missingParams = method.expectedParams.filter(p => !params.includes(p));
        
        if (missingParams.length > 0) {
          issues.push({
            method: method.name,
            issue: `Missing parameters: ${missingParams.join(', ')}`
          });
        }
      }
    });

    return issues;
  }

  checkCommonMistakes(code: string): string[] {
    const mistakes: string[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      if (trimmed === 'return BetDecision.stop():') {
        mistakes.push(`Line ${lineNum}: Missing reason in BetDecision.stop()`);
      }

      if (trimmed.match(/if\s+\w+\s*[^:]/)) {
        mistakes.push(`Line ${lineNum}: Missing colon after if statement`);
      }

      if (trimmed.match(/ctx\.get_balance\s*\([^)]*\)/) && trimmed.includes('(')) {
        mistakes.push(`Line ${lineNum}: get_balance() takes no parameters`);
      }

      if (trimmed.includes('ctx.get_history()') || trimmed.includes('ctx.get_history ( )')) {
        mistakes.push(`Line ${lineNum}: get_history() requires a parameter: get_history(n)`);
      }
    });

    return mistakes;
  }

  private findLineNumber(code: string, pattern: RegExp): number {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }
}

export default LiveValidator;
