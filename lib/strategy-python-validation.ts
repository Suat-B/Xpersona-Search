/**
 * Shared Python strategy validation for web and OpenClaw.
 * Single source of truth for security and structure checks.
 */

export const MAX_PYTHON_CODE_LENGTH = 10_000;

const DANGEROUS_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bimport\s+os\b/, message: "Dangerous import 'os' not allowed" },
  { pattern: /\bfrom\s+os\b/, message: "Dangerous import 'os' not allowed" },
  { pattern: /\bimport\s+sys\b/, message: "Dangerous import 'sys' not allowed" },
  { pattern: /\bfrom\s+sys\b/, message: "Dangerous import 'sys' not allowed" },
  { pattern: /\bimport\s+subprocess\b/, message: "Dangerous import 'subprocess' not allowed" },
  { pattern: /\bfrom\s+subprocess\b/, message: "Dangerous import 'subprocess' not allowed" },
  { pattern: /\bimport\s+socket\b/, message: "Dangerous import 'socket' not allowed" },
  { pattern: /\bfrom\s+socket\b/, message: "Dangerous import 'socket' not allowed" },
  { pattern: /\bimport\s+requests\b/, message: "Dangerous import 'requests' not allowed" },
  { pattern: /\bfrom\s+requests\b/, message: "Dangerous import 'requests' not allowed" },
  { pattern: /\bimport\s+urllib\b/, message: "Dangerous import 'urllib' not allowed" },
  { pattern: /\bfrom\s+urllib\b/, message: "Dangerous import 'urllib' not allowed" },
  { pattern: /__import__\s*\(/, message: "Dangerous __import__ not allowed" },
  { pattern: /\beval\s*\(/, message: "Dangerous eval() not allowed" },
  { pattern: /\bexec\s*\(/, message: "Dangerous exec() not allowed" },
  { pattern: /\bcompile\s*\(/, message: "Dangerous compile() not allowed" },
  { pattern: /\bopen\s*\(/, message: "File open() not allowed" },
  { pattern: /\bfile\s*\(/, message: "file() not allowed" },
];

export interface PythonValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Python strategy code for security and required structure.
 * Used by API (POST strategies) and OpenClaw (casino_deploy_strategy).
 */
export function validatePythonStrategyCode(code: string): PythonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof code !== "string" || !code.trim()) {
    errors.push("Code is required and must be non-empty");
    return { valid: false, errors, warnings };
  }

  if (code.length > MAX_PYTHON_CODE_LENGTH) {
    errors.push(`Code exceeds maximum length (${MAX_PYTHON_CODE_LENGTH} characters)`);
  }

  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  if (!code.includes("on_round_start")) {
    warnings.push("Strategy should implement 'on_round_start' method");
  }

  if (!code.includes("BetDecision") && !code.includes("decision")) {
    warnings.push("Strategy should return BetDecision from on_round_start");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
