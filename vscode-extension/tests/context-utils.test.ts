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

  it("ignores leaked .trae/@qwen-code runtime paths as task file references", () => {
    expect(
      extractTaskPathReferences(
        "please edit app/api/v1/playground/models/route.ts and c:\\Users\\suatb\\.trae\\extensions\\playgroundai.xpersona-playground-0.0.59\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli.js"
      )
    ).toEqual([{ query: "app/api/v1/playground/models/route.ts" }]);
  });
});
