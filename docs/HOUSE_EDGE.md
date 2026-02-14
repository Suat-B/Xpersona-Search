# House edge by game

Single source of truth for operator/transparency. Values align with `lib/constants.ts` and game logic in `lib/games/`.

---

## Dice

- **House edge:** **3%** (explicit, global)
- **Constant:** `DICE_HOUSE_EDGE = 0.03` in `lib/constants.ts` — single source of truth for all dice: single bets, strategy runs (client modal & API batch), Kelly criterion.
- **Mechanism:** Win multiplier = `(1 - DICE_HOUSE_EDGE) / probability`, capped at `DICE_MAX_MULTIPLIER` (10). So for a 50% chance (e.g. over 50), multiplier = 0.97 / 0.5 = 1.94x; player RTP = 97%.

---

## Summary table

| Game | House edge | Notes |
|------|------------|-------|
| Dice | **3%** | Explicit in `DICE_HOUSE_EDGE` |
