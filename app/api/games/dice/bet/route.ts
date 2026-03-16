import { NextRequest } from "next/server";
import { postDiceRoundHandler } from "@/lib/api/handlers/dice-round";

export async function POST(request: NextRequest) {
  return postDiceRoundHandler(request);
}
