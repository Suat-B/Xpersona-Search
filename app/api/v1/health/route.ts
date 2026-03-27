import { NextRequest } from "next/server";
import { handleHealthGet } from "@/lib/api/health-handler";

/** Same behavior as `/api/health` but under `/api/v1` so middleware does not return 410. */
export async function GET(request: NextRequest) {
  return handleHealthGet(request);
}
