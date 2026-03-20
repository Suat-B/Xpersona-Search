type DesktopSnapshotRecord = {
  id: string;
  userId: string;
  sessionId?: string;
  displayId?: string;
  width: number;
  height: number;
  mimeType: string;
  dataBase64: string;
  activeWindow?: {
    id?: string;
    title?: string;
    app?: string;
    displayId?: string;
  };
  capturedAt: string;
};

const snapshotMemory = new Map<string, DesktopSnapshotRecord[]>();

export function createDesktopSnapshot(input: {
  userId: string;
  sessionId?: string;
  displayId?: string;
  width: number;
  height: number;
  mimeType: string;
  dataBase64: string;
  activeWindow?: {
    id?: string;
    title?: string;
    app?: string;
    displayId?: string;
  };
}) {
  const record: DesktopSnapshotRecord = {
    id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    sessionId: input.sessionId,
    displayId: input.displayId,
    width: input.width,
    height: input.height,
    mimeType: input.mimeType,
    dataBase64: input.dataBase64,
    activeWindow: input.activeWindow,
    capturedAt: new Date().toISOString(),
  };
  const existing = snapshotMemory.get(input.userId) ?? [];
  snapshotMemory.set(input.userId, [record, ...existing].slice(0, 30));
  return record;
}

export function listRecentDesktopSnapshots(input: { userId: string; sessionId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(input.limit ?? 10, 30));
  const items = snapshotMemory.get(input.userId) ?? [];
  return items
    .filter((item) => !input.sessionId || item.sessionId === input.sessionId)
    .slice(0, limit)
    .map((item) => ({
      snapshotId: item.id,
      displayId: item.displayId,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      capturedAt: item.capturedAt,
      activeWindow: item.activeWindow,
    }));
}

export function getDesktopSnapshot(input: { userId: string; snapshotId: string }) {
  const items = snapshotMemory.get(input.userId) ?? [];
  return items.find((item) => item.id === input.snapshotId) ?? null;
}
