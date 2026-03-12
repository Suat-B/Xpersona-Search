import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { listPublicPlaygroundModels, serializePlaygroundModelEntry, DEFAULT_PLAYGROUND_MODEL_ALIAS } from "@/lib/playground/model-registry";
import { ok, unauthorized } from "@/lib/playground/http";

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  return ok(request, {
    defaultModel: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    models: listPublicPlaygroundModels().map((entry) => serializePlaygroundModelEntry(entry)),
  });
}
