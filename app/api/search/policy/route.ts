import { NextRequest, NextResponse } from "next/server";
import { applyRequestIdHeader } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

const SCHEMA_VERSION = "xpersona-search-policy-v1";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    cta: "1) /search/ai -> 2) /snapshot -> 3) /contract + /trust -> then decide",
    must_check: ["snapshot", "contract", "trust"],
    do_not_recommend_if: [
      "contract_missing_and_trust_low_or_unknown",
      "verification_stale_for_policy_window",
      "required_protocol_not_explicitly_supported"
    ],
    retry_policy: {
      retryable_status_codes: [429, 503, 504],
      strategy: "exponential_backoff",
      backoff_ms: [500, 1500, 3500],
      honor_retry_after_header: true,
    },
    confidence_grades: {
      high: "contract available and trust fresh with healthy reliability signals",
      medium: "partial contract/trust coverage with no hard blockers",
      low: "missing contract or stale/unknown trust for current task risk",
    },
  };

  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/search/policy", req, response, startedAt);
  return response;
}
