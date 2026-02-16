/**
 * Single source of truth for credit package specs.
 *
 * To change package values: Edit lib/credit-packages-config.json
 * - name: Display name
 * - credits: Credits granted
 * - amountCents: Price (e.g. 500 = $5.00, 1499 = $14.99)
 * - envKey: Env var for Stripe Price ID (STRIPE_PRICE_500, etc.)
 *
 * Then: npm run seed
 * If adding/changing prices: npm run setup:stripe (creates new Stripe products)
 */

import config from "./credit-packages-config.json";

export type PackageSpec = {
  envKey: string;
  name: string;
  credits: number;
  amountCents: number;
};

export const PACKAGE_SPECS: PackageSpec[] = config;
