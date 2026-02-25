export function apiV1(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/api/v1/")) return normalized;
  if (normalized.startsWith("/api/")) {
    return `/api/v1${normalized.slice("/api".length)}`;
  }
  return `/api/v1${normalized}`;
}
