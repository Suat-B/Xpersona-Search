import type { BinaryBuildEvent } from "@/lib/binary/contracts";
import { getBinaryBuildRecord, listBinaryBuildEvents } from "@/lib/binary/store";
import { isBinaryBuildActive, subscribeBinaryBuildEvents } from "@/lib/binary/service";

function encodeEvent(event: BinaryBuildEvent): Uint8Array {
  const payload = JSON.stringify(event);
  return new TextEncoder().encode(`id: ${event.id}\ndata: ${payload}\n\n`);
}

function isTerminalEvent(event: BinaryBuildEvent): boolean {
  return event.type === "build.completed" || event.type === "build.failed" || event.type === "build.canceled";
}

export async function createBinaryEventStreamResponse(input: {
  request: Request;
  buildId: string;
  cursor?: string | null;
}): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const seen = new Set<string>();
  let closed = false;
  let unsubscribe = () => {};

  const close = async () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    try {
      await writer.close();
    } catch {
      // Ignore double-close races from terminal events / client disconnects.
    }
  };

  const emit = async (event: BinaryBuildEvent) => {
    if (closed || seen.has(event.id)) return;
    seen.add(event.id);
    await writer.write(encodeEvent(event));
    if (isTerminalEvent(event)) {
      await close();
    }
  };

  input.request.signal.addEventListener("abort", () => {
    void close();
  });

  void (async () => {
    try {
      if (isBinaryBuildActive(input.buildId)) {
        unsubscribe = subscribeBinaryBuildEvents(input.buildId, (event) => emit(event));
      }

      const replay = await listBinaryBuildEvents(input.buildId, input.cursor);
      for (const event of replay) {
        await emit(event);
      }

      if (!isBinaryBuildActive(input.buildId)) {
        const record = await getBinaryBuildRecord(input.buildId);
        if (!record || record.status === "completed" || record.status === "failed" || record.status === "canceled") {
          await close();
        }
      }
    } catch {
      await close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
