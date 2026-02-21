/**
 * Cloudflare DNS service for ANS *.xpersona.agent domains.
 * Per XPERSONA ANS PLAN1.MD — optional; if env missing, skip DNS creation.
 */

const BASE_URL = "https://api.cloudflare.com/client/v4";

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
  accountId: string;
  ansDomain: string;
  originIp?: string;
}

function getConfig(): CloudflareConfig | null {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const ansDomain = process.env.ANS_DOMAIN?.trim() ?? "xpersona.agent";
  if (!apiToken || !zoneId || !accountId) {
    return null;
  }
  return {
    apiToken,
    zoneId,
    accountId,
    ansDomain,
    originIp: process.env.CLOUDFLARE_ORIGIN_IP?.trim(),
  };
}

export function isCloudflareConfigured(): boolean {
  return getConfig() !== null;
}

interface DnsRecordResponse {
  success: boolean;
  result?: { id: string; [key: string]: unknown };
  errors?: Array<{ code: number; message: string }>;
}

async function request<T = DnsRecordResponse>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
  const data = (await res.json()) as T & { success?: boolean; errors?: unknown[] };
  if (!res.ok) {
    const errMsg =
      Array.isArray((data as { errors?: Array<{ message?: string }> }).errors) &&
      (data as { errors: Array<{ message?: string }> }).errors[0]?.message
        ? (data as { errors: Array<{ message?: string }> }).errors[0].message
        : res.statusText;
    throw new Error(`Cloudflare API error: ${res.status} ${errMsg}`);
  }
  return data;
}

/**
 * Create A record for root domain and CNAME for www. Returns full domain.
 * Origin IP defaults to 76.76.21.21 (Vercel) if not set.
 */
export async function createDomainRecords(
  domainName: string,
  originIp?: string
): Promise<string> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  const fullDomain = `${domainName}.${config.ansDomain}`;
  const ip = originIp ?? config.originIp ?? "76.76.21.21";

  await request(`/zones/${config.zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "A",
      name: fullDomain,
      content: ip,
      ttl: 1,
      proxied: true,
    }),
  });

  await request(`/zones/${config.zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: `www.${fullDomain}`,
      content: fullDomain,
      ttl: 1,
      proxied: true,
    }),
  });

  return fullDomain;
}

/**
 * Create TXT record for agent verification (e.g. _agent.kimi.xpersona.agent).
 */
export async function createTxtRecord(
  fullDomain: string,
  value: string,
  subdomain = "_agent"
): Promise<void> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  const name = subdomain ? `${subdomain}.${fullDomain}` : fullDomain;
  await request(`/zones/${config.zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "TXT",
      name,
      content: value,
      ttl: 300,
    }),
  });
}

/**
 * List DNS records for a domain.
 */
export async function listDnsRecords(
  domainName: string
): Promise<{ id: string; type: string; name: string; content: string }[]> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  const fullDomain = `${domainName}.${config.ansDomain}`;
  const data = (await request(
    `/zones/${config.zoneId}/dns_records?name=${encodeURIComponent(fullDomain)}`
  )) as { result?: { id: string; type: string; name: string; content: string }[] };
  return data.result ?? [];
}

/**
 * Update a DNS record by ID (PATCH). Useful for TXT/A record updates without delete+create.
 */
export async function updateDnsRecord(
  recordId: string,
  updates: {
    type?: string;
    name?: string;
    content?: string;
    ttl?: number;
    proxied?: boolean;
  }
): Promise<void> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  const body: Record<string, unknown> = {};
  if (updates.type !== undefined) body.type = updates.type;
  if (updates.name !== undefined) body.name = updates.name;
  if (updates.content !== undefined) body.content = updates.content;
  if (updates.ttl !== undefined) body.ttl = updates.ttl;
  if (updates.proxied !== undefined) body.proxied = updates.proxied;
  if (Object.keys(body).length === 0) return;
  await request(
    `/zones/${config.zoneId}/dns_records/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

/**
 * Delete a DNS record by ID.
 */
export async function deleteDnsRecord(recordId: string): Promise<void> {
  const config = getConfig();
  if (!config) {
    throw new Error("Cloudflare not configured");
  }
  await request(
    `/zones/${config.zoneId}/dns_records/${recordId}`,
    { method: "DELETE" }
  );
}
