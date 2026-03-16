function normalizeStreamText(value: string | null | undefined): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function formatAssistantStreamText(input: {
  reasoningText?: string | null;
  answerText?: string | null;
}): string {
  const reasoning = normalizeStreamText(input.reasoningText);
  const answer = normalizeStreamText(input.answerText);

  if (reasoning && answer) {
    return `Reasoning:\n${reasoning}\n\nAnswer:\n${answer}`;
  }

  if (reasoning) {
    return `Reasoning:\n${reasoning}`;
  }

  return answer;
}
