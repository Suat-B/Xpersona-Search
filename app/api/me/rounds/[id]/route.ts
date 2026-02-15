/** GET /api/me/rounds/[id] — Fetch a single round (owner only) with verification data. */
import { getRoundByIdHandler } from "@/lib/api/handlers/rounds";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return getRoundByIdHandler(request, id);
}
