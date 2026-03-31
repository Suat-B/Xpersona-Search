import { describe, expect, it } from "vitest";
import { decorateUiEvent } from "./ui-events.js";
describe("decorateUiEvent", () => {
    it("adds browser-native proof metadata to tool results", () => {
        const decorated = decorateUiEvent({
            event: "tool_result",
            data: {
                name: "browser_snapshot_dom",
                ok: true,
                summary: "Captured DOM snapshot for Inbox.",
                result: {
                    name: "browser_snapshot_dom",
                    data: {
                        lane: "browser_native",
                        proof: {
                            url: "https://mail.google.com",
                            title: "Inbox",
                            interactiveElementCount: 8,
                        },
                    },
                },
            },
        });
        expect(decorated.ui).toMatchObject({
            category: "proof_captured",
            lane: "browser_native",
            surfaceHint: "overlay",
            confidence: "confident",
            proof: {
                url: "https://mail.google.com",
                title: "Inbox",
            },
        });
    });
    it("marks takeover requests as intervention events", () => {
        const decorated = decorateUiEvent({
            event: "host.takeover_required",
            data: {
                reason: "Browser verification stalled.",
            },
        });
        expect(decorated.ui).toMatchObject({
            category: "intervention_requested",
            surfaceHint: "intervention",
            confidence: "blocked",
            intervention: {
                reason: "Browser verification stalled.",
                suggestedActions: ["takeover", "repair", "resume", "cancel"],
            },
        });
    });
    it("keeps unknown events unchanged", () => {
        const event = { event: "token", data: "partial text" };
        expect(decorateUiEvent(event)).toEqual(event);
    });
});
