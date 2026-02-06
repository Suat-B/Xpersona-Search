import { hashToInt } from "./rng";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["H", "D", "C", "S"];

function buildDeck(): string[] {
  const deck: string[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

function shuffleDeck(deck: string[], serverSeed: string, clientSeed: string, nonce: number): string[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = hashToInt(serverSeed, clientSeed, nonce + i, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cardValue(card: string): number {
  const r = card.slice(0, -1);
  if (r === "A") return 11;
  if (["K", "Q", "J", "10"].includes(r)) return 10;
  return parseInt(r, 10);
}

export function handValue(hand: string[]): number {
  let v = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter((c) => c.startsWith("A")).length;
  while (v > 21 && aces) {
    v -= 10;
    aces--;
  }
  return v;
}

export function isBlackjack(hand: string[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

export function createBlackjackRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): { deck: string[]; playerHand: string[]; dealerHand: string[] } {
  const deck = shuffleDeck(buildDeck(), serverSeed, clientSeed, nonce);
  const playerHand = [deck[0], deck[1]];
  const dealerHand = [deck[2]];
  const remaining = deck.slice(3);
  return { deck: remaining, playerHand, dealerHand };
}

export function dealerPlay(deck: string[]): { cards: string[]; remaining: string[] } {
  const cards: string[] = [];
  let idx = 0;
  while (idx < deck.length) {
    cards.push(deck[idx++]);
    if (handValue(cards) >= 17) break;
  }
  return { cards, remaining: deck.slice(idx) };
}

export function settleBlackjack(
  playerHands: string[][],
  dealerHand: string[],
  betAmount: number
): { outcome: "win" | "loss" | "push"; payout: number } {
  const dealerVal = handValue(dealerHand);
  const dealerBj = isBlackjack(dealerHand);
  let totalPayout = 0;
  for (const hand of playerHands) {
    const playerVal = handValue(hand);
    const playerBj = isBlackjack(hand);
    if (playerVal > 21) continue;
    if (dealerVal > 21) {
      totalPayout += playerBj ? Math.round(betAmount * 2.5) : betAmount * 2;
      continue;
    }
    if (playerBj && !dealerBj) {
      totalPayout += Math.round(betAmount * 2.5);
      continue;
    }
    if (dealerBj && !playerBj) continue;
    if (playerVal > dealerVal) totalPayout += playerBj ? Math.round(betAmount * 2.5) : betAmount * 2;
    else if (playerVal === dealerVal) totalPayout += betAmount;
  }
  const totalBet = betAmount * playerHands.length;
  if (totalPayout > totalBet) return { outcome: "win", payout: totalPayout };
  if (totalPayout < totalBet) return { outcome: "loss", payout: totalPayout };
  return { outcome: "push", payout: totalPayout };
}
