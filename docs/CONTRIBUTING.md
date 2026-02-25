# Contributing Notes

## API URL Conventions

The middleware returns `410 API_VERSION_DEPRECATED` for legacy `/api/*` endpoints.
Use versioned endpoints instead:

- Client requests should use `/api/v1/*`.
- Prefer the helper `apiV1()` from `lib/api/url.ts` to build API URLs.
- The only exception is `/api/auth/*`, which remains unversioned.

Example:

```ts
import { apiV1 } from "@/lib/api/url";

fetch(apiV1("/search?limit=10"));
```
