import { getRoundsHandler } from "@/lib/api/handlers/rounds";

export async function GET(request: Request) {
  return getRoundsHandler(request);
}
