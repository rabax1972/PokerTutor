import { type Card, rankOf, suitOf, RANK_NAMES_IT, RANK_PLURAL_IT } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES_IT: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carta alta',
  [HandCategory.Pair]: 'Coppia',
  [HandCategory.TwoPair]: 'Doppia coppia',
  [HandCategory.Trips]: 'Tris',
  [HandCategory.Straight]: 'Scala',
  [HandCategory.Flush]: 'Colore',
  [HandCategory.FullHouse]: 'Full',
  [HandCategory.Quads]: 'Poker',
  [HandCategory.StraightFlush]: 'Scala colore',
};

/**
 * Punteggio numerico: categoria nei bit alti, poi fino a 5 rank di spareggio (4 bit ciascuno).
 * Un punteggio più alto batte sempre uno più basso; uguale = parità esatta.
 */
function encode(cat: number, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0): number {
  return cat * 0x100000 + r1 * 0x10000 + r2 * 0x1000 + r3 * 0x100 + r4 * 0x10 + r5;
}

export function categoryOf(score: number): HandCategory {
  return Math.floor(score / 0x100000) as HandCategory;
}

/** Rank di spareggio codificati nel punteggio (dal più significativo). */
export function tiebreakRanks(score: number): number[] {
  return [
    (score >> 16) & 0xf,
    (score >> 12) & 0xf,
    (score >> 8) & 0xf,
    (score >> 4) & 0xf,
    score & 0xf,
  ];
}

/** Restituisce il rank più alto della scala contenuta nella maschera (0 se assente). Gestisce A-2-3-4-5. */
function straightTop(mask: number): number {
  const m = mask | (((mask >> 14) & 1) << 1); // l'asso vale anche 1
  for (let top = 14; top >= 5; top--) {
    const need = 0b11111 << (top - 4);
    if ((m & need) === need) return top;
  }
  return 0;
}

function topBits(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

/** Valuta la miglior mano di 5 carte tra 5, 6 o 7 carte. Veloce: usato anche nel Monte Carlo. */
export function evaluate(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = rankOf(c);
    const s = suitOf(c);
    counts[r]++;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sf = straightTop(suitMasks[flushSuit]);
    if (sf) return encode(HandCategory.StraightFlush, sf);
  }

  let quad = 0;
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = counts[r];
    if (n === 4) quad = r;
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
    else if (n === 1) singles.push(r);
  }

  if (quad) {
    let kicker = 0;
    for (let r = 14; r >= 2; r--) if (r !== quad && counts[r] > 0) { kicker = r; break; }
    return encode(HandCategory.Quads, quad, kicker);
  }

  if (trips.length > 0 && (trips.length >= 2 || pairs.length > 0)) {
    const t = trips[0];
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return encode(HandCategory.FullHouse, t, p);
  }

  if (flushSuit >= 0) {
    const [a, b, c, d, e] = topBits(suitMasks[flushSuit], 5);
    return encode(HandCategory.Flush, a, b, c, d, e);
  }

  const st = straightTop(rankMask);
  if (st) return encode(HandCategory.Straight, st);

  if (trips.length > 0) {
    return encode(HandCategory.Trips, trips[0], singles[0] ?? 0, singles[1] ?? 0);
  }

  if (pairs.length >= 2) {
    const kicker = Math.max(pairs[2] ?? 0, singles[0] ?? 0);
    return encode(HandCategory.TwoPair, pairs[0], pairs[1], kicker);
  }

  if (pairs.length === 1) {
    return encode(HandCategory.Pair, pairs[0], singles[0] ?? 0, singles[1] ?? 0, singles[2] ?? 0);
  }

  return encode(
    HandCategory.HighCard,
    singles[0] ?? 0, singles[1] ?? 0, singles[2] ?? 0, singles[3] ?? 0, singles[4] ?? 0,
  );
}

export interface HandResult {
  score: number;
  category: HandCategory;
  /** Le 5 carte che compongono la mano migliore. */
  best: Card[];
  /** Descrizione in italiano, es. "Full di Assi e Re". */
  name: string;
}

function combinations5(cards: readonly Card[]): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return out;
}

export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const [r1, r2] = tiebreakRanks(score);
  switch (cat) {
    case HandCategory.StraightFlush:
      return r1 === 14 ? 'Scala reale' : `Scala colore al ${RANK_NAMES_IT[r1]}`;
    case HandCategory.Quads:
      return `Poker di ${RANK_PLURAL_IT[r1]}`;
    case HandCategory.FullHouse:
      return `Full di ${RANK_PLURAL_IT[r1]} e ${RANK_PLURAL_IT[r2]}`;
    case HandCategory.Flush:
      return `Colore al ${RANK_NAMES_IT[r1]}`;
    case HandCategory.Straight:
      return `Scala al ${RANK_NAMES_IT[r1]}`;
    case HandCategory.Trips:
      return `Tris di ${RANK_PLURAL_IT[r1]}`;
    case HandCategory.TwoPair:
      return `Doppia coppia: ${RANK_PLURAL_IT[r1]} e ${RANK_PLURAL_IT[r2]}`;
    case HandCategory.Pair:
      return `Coppia di ${RANK_PLURAL_IT[r1]}`;
    default:
      return `Carta alta: ${RANK_NAMES_IT[r1]}`;
  }
}

/** Valutazione completa (più lenta): include le 5 carte migliori e il nome della mano. */
export function evaluateDetailed(cards: readonly Card[]): HandResult {
  if (cards.length < 5) throw new Error('Servono almeno 5 carte');
  const score = evaluate(cards);
  let best: Card[] = cards.slice(0, 5);
  if (cards.length > 5) {
    for (const combo of combinations5(cards)) {
      if (evaluate(combo) === score) { best = combo; break; }
    }
  }
  return { score, category: categoryOf(score), best, name: describeScore(score) };
}

/** Confronta due mani: >0 se a vince, <0 se vince b, 0 parità. */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  return evaluate(a) - evaluate(b);
}
