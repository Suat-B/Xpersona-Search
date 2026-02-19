/**
 * Send signal to Discord via webhook URL.
 * Format: Xpersona Signal structure as Discord embed/message.
 */

export interface SignalPayload {
  strategyName?: string;
  asset?: string;
  action?: string;
  entry?: number | string;
  stop?: number | string;
  target?: number | string;
  confidence?: number;
  message?: string;
}

export async function sendToDiscord(
  webhookUrl: string,
  payload: SignalPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const content = formatSignalMessage(payload);
    const body = {
      content,
      embeds: [
        {
          title: "Xpersona Signal",
          color: 0x30d158,
          fields: [
            payload.strategyName && { name: "Strategy", value: payload.strategyName, inline: true },
            payload.asset && { name: "Asset", value: payload.asset, inline: true },
            payload.action && { name: "Action", value: payload.action, inline: true },
            payload.entry != null && { name: "Entry", value: String(payload.entry), inline: true },
            payload.stop != null && { name: "Stop", value: String(payload.stop), inline: true },
            payload.target != null && { name: "Target", value: String(payload.target), inline: true },
            payload.confidence != null && { name: "Confidence", value: `${payload.confidence}%`, inline: true },
          ].filter(Boolean) as { name: string; value: string; inline: boolean }[],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Discord ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

function formatSignalMessage(p: SignalPayload): string {
  const parts: string[] = ["**Xpersona Signal**"];
  if (p.strategyName) parts.push(`Strategy: ${p.strategyName}`);
  if (p.asset) parts.push(`Asset: ${p.asset}`);
  if (p.action) parts.push(`Action: ${p.action}`);
  if (p.entry != null) parts.push(`Entry: ${p.entry}`);
  if (p.stop != null) parts.push(`Stop: ${p.stop}`);
  if (p.target != null) parts.push(`Target: ${p.target}`);
  if (p.confidence != null) parts.push(`Confidence: ${p.confidence}%`);
  if (p.message) parts.push(p.message);
  return parts.join("\n");
}
