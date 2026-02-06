import { SLOTS_REELS, SLOTS_ROWS_VISIBLE, SLOTS_PAYLINES } from "@/lib/constants";
import { hashToInt } from "./rng";

/** Symbol ids: 0=Wild, 1=Seven, 2=Bar, 3=Bell, 4=Cherry, 5=Lemon */
const STRIP_LENGTH = 32;

const REEL_0 = [1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4];
const REEL_1 = [2, 5, 1, 4, 3, 2, 5, 1, 4, 3, 2, 5, 1, 4, 3, 2, 5, 1, 4, 3, 2, 5, 1, 4, 3, 2, 5, 1, 4, 3, 2, 5];
const REEL_2 = [3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1];
const REEL_3 = [4, 2, 5, 1, 3, 4, 2, 5, 1, 3, 4, 2, 5, 1, 3, 4, 2, 5, 1, 3, 4, 2, 5, 1, 3, 4, 2, 5, 1, 3, 4, 2];
const REEL_4 = [5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3, 1, 4, 2, 5, 3];
const REELS = [REEL_0, REEL_1, REEL_2, REEL_3, REEL_4];

/** Paylines: each element is [row0, row1, row2, row3, row4] for reels 0..4 (row 0=top, 1=mid, 2=bot). */
const PAYLINE_ROWS: [number, number, number, number, number][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
];

/** Paytable: symbolId -> count (3,4,5) -> multiplier. Wild (0) substitutes; pay by best matching symbol. */
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 3: 5, 4: 20, 5: 100 },
  2: { 3: 3, 4: 15, 5: 50 },
  3: { 3: 2, 4: 10, 5: 25 },
  4: { 3: 2, 4: 5, 5: 15 },
  5: { 3: 1, 4: 3, 5: 10 },
};

const WILD = 0;

function getSymbolAt(reelGrid: number[][], reel: number, row: number): number {
  return reelGrid[reel][row] ?? 0;
}

/** Evaluate one payline: left-to-right; first non-wild sets symbol, count consecutive (symbol or wild). */
function evalLine(
  reelGrid: number[][],
  lineRows: [number, number, number, number, number]
): { symbolId: number; count: number; multiplier: number } | null {
  const symbols: number[] = [];
  for (let r = 0; r < 5; r++) {
    symbols.push(getSymbolAt(reelGrid, r, lineRows[r]));
  }
  let matchId = -1;
  for (let i = 0; i < symbols.length; i++) {
    if (symbols[i] !== WILD) {
      matchId = symbols[i]!;
      break;
    }
  }
  if (matchId === -1) matchId = 1;
  let count = 0;
  for (let i = 0; i < symbols.length; i++) {
    if (symbols[i] === matchId || symbols[i] === WILD) count++;
    else break;
  }
  if (count < 3) return null;
  const table = PAYTABLE[matchId];
  if (!table) return null;
  const mult = table[count as 3 | 4 | 5] ?? table[3] ?? 0;
  return { symbolId: matchId, count, multiplier: mult };
}

export function runSlotsSpin(
  amount: number,
  serverSeed: string,
  clientSeed: string,
  nonce: number
): {
  reels: number[][];
  wins: { lineIndex: number; symbolId: number; count: number; payout: number }[];
  totalPayout: number;
  resultPayload: { reels: number[][]; wins: { lineIndex: number; symbolId: number; count: number; payout: number }[]; totalPayout: number };
} {
  const reelGrid: number[][] = [];
  for (let r = 0; r < SLOTS_REELS; r++) {
    const stop = hashToInt(serverSeed, clientSeed, nonce + r, STRIP_LENGTH);
    const strip = REELS[r]!;
    const row = [
      strip[stop % STRIP_LENGTH]!,
      strip[(stop + 1) % STRIP_LENGTH]!,
      strip[(stop + 2) % STRIP_LENGTH]!,
    ];
    reelGrid.push(row);
  }
  const wins: { lineIndex: number; symbolId: number; count: number; payout: number }[] = [];
  let totalPayout = 0;
  for (let l = 0; l < PAYLINE_ROWS.length; l++) {
    const ev = evalLine(reelGrid, PAYLINE_ROWS[l]!);
    if (ev && ev.multiplier > 0) {
      const payout = Math.round(amount * ev.multiplier);
      wins.push({ lineIndex: l, symbolId: ev.symbolId, count: ev.count, payout });
      totalPayout += payout;
    }
  }
  return {
    reels: reelGrid,
    wins,
    totalPayout,
    resultPayload: { reels: reelGrid, wins, totalPayout },
  };
}
