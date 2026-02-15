/** GET /api/me/rounds — All rounds for the authenticated user (provably fair audit). */
import { getRoundsHandler } from "@/lib/api/handlers/rounds";

export async function GET(request: Request) {
  return getRoundsHandler(request);
}
