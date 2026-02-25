import { LRUCache } from "@/lib/search/cache";

export const graphRecommendCache = new LRUCache<unknown>(200, 60_000);
export const graphPlanCache = new LRUCache<unknown>(150, 60_000);
export const graphRelatedCache = new LRUCache<unknown>(200, 60_000);
export const graphTopCache = new LRUCache<unknown>(120, 60_000);
