import { NextRequest } from "next/server";
import { handleHealthGet } from "@/lib/api/health-handler";

export async function GET(request: NextRequest) {
  return handleHealthGet(request);
}
