import { incRequest, observeDuration } from "@/lib/metrics/registry";

export function recordApiResponse(
  route: string,
  req: Request,
  res: Response,
  startedAt: number
) {
  const durationMs = Date.now() - startedAt;
  const labels = {
    route,
    method: req.method,
    status: res.status,
  };
  incRequest(labels);
  observeDuration(labels, durationMs);
}
