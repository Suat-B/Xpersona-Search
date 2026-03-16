import { describe, expect, it } from "vitest";
import { formatAssistantStreamText } from "../src/qwen-stream-format";

describe("qwen-code-runtime", () => {
  it("formats reasoning-only assistant output as regular chat text", () => {
    expect(
      formatAssistantStreamText({
        reasoningText: "I should inspect the current workspace file first.",
      })
    ).toBe("Reasoning:\nI should inspect the current workspace file first.");
  });

  it("formats reasoning and answer together in one assistant message", () => {
    expect(
      formatAssistantStreamText({
        reasoningText: "I found the relevant plan file and I am expanding it.",
        answerText: "Here is the expanded integration plan.",
      })
    ).toBe(
      "Reasoning:\nI found the relevant plan file and I am expanding it.\n\nAnswer:\nHere is the expanded integration plan."
    );
  });

  it("falls back to the answer when no reasoning text exists", () => {
    expect(
      formatAssistantStreamText({
        answerText: "Here is the updated plan.",
      })
    ).toBe("Here is the updated plan.");
  });
});
