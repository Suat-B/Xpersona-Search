/**
 * Server-side service detection from request headers.
 * Middleware sets x-service header; this reads it for layouts and Server Components.
 */

import { headers } from "next/headers";
import { getServiceFromHost } from "@/lib/subdomain";
import type { Service } from "@/lib/subdomain";

export async function getService(): Promise<Service> {
  const headersList = await headers();
  const serviceHeader = headersList.get("x-service");
  if (
    serviceHeader === "game" ||
    serviceHeader === "trading" ||
    serviceHeader === "hub"
  ) {
    return serviceHeader;
  }
  const host = headersList.get("host") ?? "";
  return getServiceFromHost(host);
}
