"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanizeSuppressedAssistantArtifact = humanizeSuppressedAssistantArtifact;
exports.buildVisibleTranscriptText = buildVisibleTranscriptText;
exports.buildOperationalTranscriptText = buildOperationalTranscriptText;
exports.buildAssistantTranscriptText = buildAssistantTranscriptText;
exports.hasVisibleOperationalTranscript = hasVisibleOperationalTranscript;
exports.mergeTranscriptIntoAssistantContent = mergeTranscriptIntoAssistantContent;
const cutie_native_autonomy_1 = require("./cutie-native-autonomy");
function trimText(value) {
    return String(value || "").trim();
}
function extractToolNameFromArtifact(raw) {
    const text = trimText(raw);
    if (!text)
        return "";
    const patterns = [
        /"toolName"\s*:\s*"([^"]+)"/i,
        /"tool_call"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/i,
        /"tool_calls"\s*:\s*\[[\s\S]*?"name"\s*:\s*"([^"]+)"/i,
        /"name"\s*:\s*"([^"]+)"/i,
        /"tool"\s*:\s*"([^"]+)"/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match?.[1])
            return match[1].trim();
    }
    return "";
}
function isLowSignalConversationStatus(text) {
    return /^(Cutie is replying|Cutie is finishing the response|Cutie completed the run)\.?$/i.test(trimText(text));
}
function isVisibleTranscriptEvent(event, goal) {
    if (!event || !trimText(event.text))
        return false;
    if (goal === "conversation" && event.kind === "status" && isLowSignalConversationStatus(event.text)) {
        return false;
    }
    return true;
}
function isAssistantTranscriptEvent(event) {
    return event.kind === "assistant_text" || event.kind === "final";
}
function formatTranscriptSectionLines(lines) {
    return lines.map((line) => trimText(line)).filter(Boolean).join("\n\n");
}
function humanizeSuppressedAssistantArtifact(raw) {
    const text = trimText(raw);
    if (!text)
        return "";
    const toolName = extractToolNameFromArtifact(text);
    if (toolName) {
        return `Recovered \`${toolName}\` action from model output.`;
    }
    if ((0, cutie_native_autonomy_1.looksLikeCutieToolArtifactText)(text)) {
        return "Recovered a tool action from model output.";
    }
    return "Model emitted an unrecognized tool artifact; Cutie is attempting recovery.";
}
function buildVisibleTranscriptText(events, goal) {
    const rows = (Array.isArray(events) ? events : [])
        .filter((event) => isVisibleTranscriptEvent(event, goal))
        .map((event) => trimText(event.text));
    return rows.join("\n");
}
function buildOperationalTranscriptText(events, goal) {
    const rows = (Array.isArray(events) ? events : [])
        .filter((event) => isVisibleTranscriptEvent(event, goal))
        .filter((event) => !isAssistantTranscriptEvent(event))
        .map((event) => trimText(event.text));
    return formatTranscriptSectionLines(rows);
}
function buildAssistantTranscriptText(events, goal) {
    const rows = (Array.isArray(events) ? events : [])
        .filter((event) => isVisibleTranscriptEvent(event, goal))
        .filter((event) => isAssistantTranscriptEvent(event))
        .map((event) => trimText(event.text));
    return rows.length ? trimText(rows[rows.length - 1] || "") : "";
}
function hasVisibleOperationalTranscript(events, goal) {
    return Boolean(buildOperationalTranscriptText(events, goal));
}
function mergeTranscriptIntoAssistantContent(input) {
    const transcriptText = buildOperationalTranscriptText(input.events, input.goal);
    const assistantContent = trimText(input.assistantContent || "") || buildAssistantTranscriptText(input.events, input.goal);
    if (!transcriptText)
        return assistantContent || buildVisibleTranscriptText(input.events, input.goal);
    if (!hasVisibleOperationalTranscript(input.events, input.goal)) {
        return assistantContent || transcriptText;
    }
    if (!assistantContent) {
        return ["Cutie action log:", transcriptText].filter(Boolean).join("\n\n");
    }
    return ["Cutie action log:", transcriptText, "Cutie response:", assistantContent].filter(Boolean).join("\n\n");
}
//# sourceMappingURL=cutie-transcript.js.map