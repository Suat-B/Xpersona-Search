# Provably fair dice

Every dice round is stored with a unique bet id, timestamp, and a linked server seed. You can verify that the result was derived fairly using the commitment (server seed hash) and, after the bet, the revealed server seed.

## How it works

1. **Before the bet:** The house commits to a secret server seed by storing and exposing only its hash: `serverSeedHash = SHA256(serverSeed)`. You see this hash (and your client seed and nonce) so the outcome cannot be changed after the fact without changing the hash.
2. **The roll:** The result is computed deterministically from `serverSeed`, `clientSeed`, and `nonce` (see formula below).
3. **After the bet:** You can reveal the server seed for any of your dice bets and verify locally that (a) `SHA256(serverSeed)` matches the committed hash, and (b) the formula yields the same result.

## Verification formula

The dice value (a number in the range [0, 100)) is computed as follows:

1. Concatenate: `serverSeed + clientSeed + ":" + nonce` (as strings).
2. Take the SHA-256 hash of that string (hex encoding).
3. Take the first 8 hex characters of the hash.
4. Interpret those 8 hex characters as an integer and divide by 2^32 (0x100000000).
5. Multiply by 100 to get the dice value in [0, 100).

Pseudocode:

```text
value = (parseInt(SHA256(serverSeed + clientSeed + ":" + nonce).slice(0, 8), 16) / 0x100000000) * 100
```

In our codebase this is implemented in `lib/games/rng.ts` (`hashToFloat`) and `lib/games/dice.ts` (multiply by 100 for the dice value).

## API

- **GET /api/v1/me/rounds?gameType=dice** — List your recent dice rounds. Each round includes verification data: `serverSeedHash`, `clientSeed`, `nonce`, and `resultPayload` (value, target, condition, win, multiplier).
- **GET /api/v1/me/rounds/[id]** — Fetch a single round (yours only) with full verification payload. Use **?reveal=1** to include the `serverSeed` in the response so you can run the formula locally and confirm the hash.

Example verification response (without reveal):

```json
{
  "success": true,
  "data": {
    "id": "...",
    "gameType": "dice",
    "amount": 10,
    "outcome": "win",
    "payout": 19,
    "resultPayload": { "value": 67.5, "target": 50, "condition": "over", "win": true, "multiplier": 1.94 },
    "createdAt": "...",
    "verification": {
      "serverSeedHash": "a1b2c3...",
      "clientSeed": "",
      "nonce": 0,
      "verificationFormula": "SHA256(serverSeed + clientSeed + ':' + nonce) → first 8 hex chars as integer → / 2^32 → * 100 = dice value in [0, 100)."
    }
  }
}
```

With `?reveal=1`, the `verification` object also includes `serverSeed` so you can verify the hash and recompute the value yourself.

## Tracking every instance

All dice plays (manual rolls from the web app, strategy runs, and OpenClaw agent bets) use the same execution path: a server seed is created, stored in `server_seeds`, and linked from `game_bets` via `server_seed_id`. There are no unlinked dice bets; every round is part of the same provably fair audit trail.
