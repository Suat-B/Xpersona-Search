import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, unauthorized } from "@/lib/playground/http";
import {
  DEFAULT_PLAYGROUND_MODEL_ALIAS,
  listPublicPlaygroundModels,
  serializePlaygroundModelEntry,
} from "@/lib/playground/model-registry";

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  return ok(request, {
    defaultModel: DEFAULT_PLAYGROUND_MODEL_ALIAS,
    models: listPublicPlaygroundModels().map((entry) => serializePlaygroundModelEntry(entry)),
  });
}
