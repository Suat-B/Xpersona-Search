import { describe, expect, it } from "vitest";
import { extractTaskPathReferences, rankWorkspacePathMatches } from "../src/context-utils";

describe("context-utils", () => {
  it("extracts plain file references and line hints from user text", () => {
    expect(
      extractTaskPathReferences(
        "please update FractalDimensionOscillator.pine:82 and app/api/v1/playground/models/route.ts"
      )
    ).toEqual([
      { query: "app/api/v1/playground/models/route.ts" },
      { query: "FractalDimensionOscillator.pine", line: 82 },
    ]);
  });

  it("ranks active and basename matches ahead of loose path matches", () => {
    expect(
      rankWorkspacePathMatches(
        "route.ts",
        [
          "components/nav/route.ts",
          "app/api/v1/playground/models/route.ts",
          "lib/other-route.ts",
        ],
        {
          activePath: "app/api/v1/playground/models/route.ts",
          openFiles: ["app/api/v1/playground/models/route.ts"],
        }
      )
    ).toEqual([
      "app/api/v1/playground/models/route.ts",
      "components/nav/route.ts",
      "lib/other-route.ts",
    ]);
  });
});
