import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareBinaryGenerationWorkspace } from "@/lib/binary/generation-provider";

const ORIGINAL_HF_ROUTER_TOKEN = process.env.HF_ROUTER_TOKEN;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  if (typeof ORIGINAL_HF_ROUTER_TOKEN === "string") process.env.HF_ROUTER_TOKEN = ORIGINAL_HF_ROUTER_TOKEN;
  else delete process.env.HF_ROUTER_TOKEN;

  if (ORIGINAL_FETCH) {
    global.fetch = ORIGINAL_FETCH;
  } else {
    // `fetch` exists in our Node test runtime, but keep the cleanup defensive.
    delete (global as { fetch?: typeof fetch }).fetch;
  }

  vi.restoreAllMocks();
});

describe("binary generation provider", () => {
  it("falls back to the deterministic starter when hosted generation references missing local modules", async () => {
    process.env.HF_ROUTER_TOKEN = "test-token";

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  displayName: "TypeScript Service",
                  description: "Hosted starter with a missing helper",
                  entrypoint: "src/index.ts",
                  files: {
                    "src/index.ts": [
                      'import { greet } from "./greet";',
                      "",
                      "export function runService() {",
                      '  return greet("love");',
                      "}",
                    ].join("\n"),
                  },
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    ) as typeof fetch;

    const prepared = await prepareBinaryGenerationWorkspace({
      request: {
        intent: "hello love",
        workspaceFingerprint: "workspace-123",
        targetEnvironment: {
          runtime: "node18",
          platform: "portable",
          packageManager: "npm",
        },
      },
    });

    expect(prepared.providerName).toBe("template_fallback");
    expect(prepared.warnings.some((warning) => warning.includes("missing local modules"))).toBe(true);
    expect(prepared.files["src/index.ts"]).toContain('from "node:http"');
    expect(prepared.files["src/index.ts"]).not.toContain('./greet');
  });
});
