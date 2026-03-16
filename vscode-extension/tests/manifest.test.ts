import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const manifestPath = path.resolve(__dirname, "../package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("vscode manifest", () => {
  it("exposes the public Binary IDE commands while keeping legacy aliases out of the manifest", () => {
    const commands = Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands : [];
    const ids = commands.map((command) => String(command.command));
    expect(new Set(ids)).toEqual(
      new Set([
        "binary.generate",
        "binary.validate",
        "binary.deploy",
        "binary.configure",
      ])
    );
  });

  it("surfaces only Binary IDE commands in the palette", () => {
    const palette = Array.isArray(manifest.contributes?.menus?.commandPalette)
      ? manifest.contributes.menus.commandPalette
      : [];
    const paletteCommands = palette.map((entry) => String(entry.command));
    expect(new Set(paletteCommands)).toEqual(
      new Set(["binary.generate", "binary.validate", "binary.deploy", "binary.configure"])
    );
    expect(paletteCommands).not.toContain("xpersona.playground.prompt");
    expect(paletteCommands).not.toContain("xpersona.playground.setApiKey");
  });

  it("publishes the renamed Binary IDE settings namespace", () => {
    const properties = manifest.contributes?.configuration?.properties || {};
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        "xpersona.binary.baseApiUrl",
        "xpersona.binary.runtime",
        "xpersona.binary.qwen.model",
        "xpersona.binary.qwen.baseUrl",
        "xpersona.binary.qwen.executable",
      ])
    );
    expect(properties["xpersona.binary.qwen.model"]?.default).toBe(
      "Qwen/Qwen3-Coder-30B-A3B-Instruct:featherless-ai"
    );
    expect(properties["xpersona.binary.qwen.baseUrl"]?.default).toBe(
      "http://localhost:3000/api/v1/hf"
    );
  });
});
