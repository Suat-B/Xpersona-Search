import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const manifestPath = path.resolve(__dirname, "../package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("vscode manifest", () => {
  it("exposes only the trimmed playground commands", () => {
    const commands = Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands : [];
    const ids = commands.map((command) => String(command.command));
    expect(new Set(ids)).toEqual(
      new Set([
        "xpersona.playground.prompt",
        "xpersona.playground.openWithSelection",
        "xpersona.playground.setApiKey",
        "xpersona.playground.signIn",
        "xpersona.playground.signOut",
        "xpersona.playground.undoLastChanges",
      ])
    );
  });

  it("does not surface deprecated command entries in the palette", () => {
    const palette = Array.isArray(manifest.contributes?.menus?.commandPalette)
      ? manifest.contributes.menus.commandPalette
      : [];
    const paletteCommands = palette.map((entry) => String(entry.command));
    expect(paletteCommands).not.toContain("xpersona.playground.mode.yolo");
    expect(paletteCommands).not.toContain("xpersona.playground.history.open");
    expect(paletteCommands).not.toContain("xpersona.playground.index.rebuild");
  });
});
