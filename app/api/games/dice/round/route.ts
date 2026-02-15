/** POST /api/games/dice/round — Play one dice round. */
import { NextRequest } from "next/server";
import { postDiceRoundHandler } from "@/lib/api/handlers/dice-round";

export async function POST(request: NextRequest) {
  return postDiceRoundHandler(request);
}
