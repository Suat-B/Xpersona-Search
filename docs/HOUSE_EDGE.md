# House edge by game

Single source of truth for operator/transparency. Values align with `lib/constants.ts` and game logic in `lib/games/`.

---

## Dice

- **House edge:** **2%** (explicit)
- **Constant:** `DICE_HOUSE_EDGE = 0.02` in `lib/constants.ts`
- **Mechanism:** Win multiplier = `(1 - DICE_HOUSE_EDGE) / probability`, capped at `DICE_MAX_MULTIPLIER` (10). So for a 50% chance (e.g. over 50), multiplier = 0.98 / 0.5 = 1.96x; player RTP = 98%.

---

## Blackjack

- **House edge:** **~0.5%** (conventional for the rules used)
- **Rules:** 1 deck, blackjack pays 2.5:1, dealer stands on 17, no explicit edge constant in code.
- **Mechanism:** Edge comes from dealer advantage (player acts first, dealer draws to 17+). With 2.5:1 blackjack the edge is slightly lower than 3:2.

---

## Plinko

- **House edge:** **~2–4%** (approximate; depends on risk profile)
- **Mechanism:** 12 rows, 50/50 L/R per peg; bucket multipliers differ by risk (low / medium / high). No explicit edge constant; RTP is implied by the multiplier tables in `lib/games/plinko.ts`. Low risk is tighter (center pays 10x); high risk has more variance (center 50x, edges 0.1x).

---

## Slots

- **House edge:** **Not a single constant**
- **Mechanism:** Set by paytable and reel strips in `lib/games/slots.ts`. RTP = sum(win_prob × payout) over all outcomes. To target a specific house edge, adjust the paytable and/or reel weights.

---

## Crash

- **House edge:** **Strategy-dependent**
- **Mechanism:** Crash point is chosen uniformly in `[CRASH_MIN_MULTIPLIER, CRASH_MAX_MULTIPLIER]` (default [1, 10]). No extra house-edge skew in the code. Expected return depends on when players cash out; no single “house edge” number unless you fix a strategy (e.g. “always cash out at 2x”).

---

## Summary table

| Game      | House edge      | Notes                                      |
|-----------|------------------|--------------------------------------------|
| Dice      | **2%**           | Explicit in `DICE_HOUSE_EDGE`              |
| Blackjack | **~0.5%**        | From rules (2.5:1 BJ, stand 17)             |
| Plinko    | **~2–4%**        | From bucket multipliers                    |
| Slots     | Configurable     | Paytable + reels                           |
| Crash     | Strategy-dependent | Uniform crash point [1, 10] (or env max) |
