/**
 * ANS (Agent Name Service) and related environment variable types.
 * Augments NodeJS.ProcessEnv for type safety.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // ANS
    STRIPE_PRICE_ID_ANS_STANDARD?: string;
    MASTER_ENCRYPTION_KEY?: string;
    ANS_DOMAIN?: string;
    ROOT_DOMAIN?: string;

    // Cloudflare DNS (optional)
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ZONE_ID?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_ORIGIN_IP?: string;

    // Upstash Redis (optional, for rate limiting)
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
  }
}
