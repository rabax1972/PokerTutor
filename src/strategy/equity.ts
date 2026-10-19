import type { Card } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { createRng, type Rng } from '../engine/rng';
import { combosOf, type Combo, type HandCode } from './handNotation';

/** Una combinazione specifica di carte con il suo peso nel range (0..1). */
export interface WeightedCombo {
  cards: Combo;
  weight: number;
}

export type WeightedRange = WeightedCombo[];

/** Costruisce un range pesato escludendo le combinazioni incompatibili con le carte note. */
export function weightedFromCodes(
  codes: Iterable<HandCode>,
  dead: readonly Card[] = [],
  weight = 1,
): WeightedRange {
  const deadSet = new Set(dead);
  const out: WeightedRange = [];
  for (const code of codes)
    for (const c of combosOf(code)) if (!deadSet.has(c[0]) && !deadSet.has(c[1])) out.push({ cards: c, weight });
  return out;
}

/** Tutte le 1326 combinazioni (range "qualsiasi due carte") meno quelle morte. */
export function anyTwo(dead: readonly Card[] = []): WeightedRange {
  const deadSet = new Set(dead);
  const out: WeightedRange = [];
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) if (!deadSet.has(a) && !deadSet.has(b)) out.push({ cards: [a, b], weight: 1 });
  return out;
}

export function removeDead(range: WeightedRange, dead: readonly Card[]): WeightedRange {
  const deadSet = new Set(dead);
  return range.filter((w) => !deadSet.has(w.cards[0]) && !deadSet.has(w.cards[1]));
}

export function totalWeight(range: WeightedRange): number {
  return range.reduce((s, w) => s + w.weight, 0);
}

export interface EquityResult {
  /** Equity dell'eroe (0..1): vittorie + quota dei pareggi. */
  equity: number;
  win: number;
  tie: number;
  iterations: number;
}

class Sampler {
  private cum: number[];
  private total: number;
  constructor(private range: WeightedRange) {
    this.cum = [];
    let t = 0;
    for (const w of range) {
      t += w.weight;
      this.cum.push(t);
    }
    this.total = t;
  }
  get empty() {
    return this.total <= 0;
  }
  sample(rng: Rng): Combo {
    const x = rng() * this.total;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return this.range[lo].cards;
  }
}

/**
 * Equity Monte Carlo dell'eroe contro uno o più avversari, ciascuno con il proprio range pesato.
 * Le combinazioni che collidono con carte già usate vengono ricampionate.
 */
export function equityVsRanges(
  hero: readonly Card[],
  board: readonly Card[],
  villains: readonly WeightedRange[],
  iterations = 4000,
  seed = 12345,
): EquityResult {
  const rng = createRng(seed);
  const known = new Set<Card>([...hero, ...board]);
  const samplers = villains.map((r) => new Sampler(removeDead(r, [...known])));
  if (samplers.length === 0 || samplers.some((s) => s.empty)) {
    return { equity: samplers.length === 0 ? 1 : 0.5, win: 0, tie: 0, iterations: 0 };
  }
  const need = 5 - board.length;
  const heroCards = [...hero, ...board];
  let wins = 0;
  let ties = 0;
  let equitySum = 0;
  let done = 0;
  const used = new Uint8Array(52);
  const villainCards: Card[][] = villains.map(() => []);
  const runout: Card[] = [];

  for (let it = 0; it < iterations; it++) {
    used.fill(0);
    for (const c of known) used[c] = 1;
    let ok = true;
    for (let v = 0; v < samplers.length && ok; v++) {
      let tries = 0;
      for (;;) {
        const combo = samplers[v].sample(rng);
        if (!used[combo[0]] && !used[combo[1]]) {
          used[combo[0]] = 1;
          used[combo[1]] = 1;
          villainCards[v] = [combo[0], combo[1]];
          break;
        }
        if (++tries > 50) { ok = false; break; }
      }
    }
    if (!ok) continue;
    runout.length = 0;
    while (runout.length < need) {
      const c = Math.floor(rng() * 52);
      if (!used[c]) {
        used[c] = 1;
        runout.push(c);
      }
    }
    const heroScore = evaluate([...heroCards, ...runout]);
    let best = 0;
    let bestCount = 0;
    for (let v = 0; v < villainCards.length; v++) {
      const sc = evaluate([...villainCards[v], ...board, ...runout]);
      if (sc > best) { best = sc; bestCount = 1; }
      else if (sc === best) bestCount++;
    }
    done++;
    if (heroScore > best) { wins++; equitySum += 1; }
    else if (heroScore === best) { ties++; equitySum += 1 / (bestCount + 1); }
  }
  if (done === 0) return { equity: 0.5, win: 0, tie: 0, iterations: 0 };
  return { equity: equitySum / done, win: wins / done, tie: ties / done, iterations: done };
}

/**
 * Equity di ciascuna combinazione di un range contro una mano/range: utile per stimare
 * quali mani dell'avversario continuerebbero. Restituisce l'equity media di `hero` contro il sottoinsieme.
 */
export function equityVsSubset(
  hero: readonly Card[],
  board: readonly Card[],
  subset: WeightedRange,
  iterations = 2500,
  seed = 777,
): number {
  if (subset.length === 0) return 0.5;
  return equityVsRanges(hero, board, [subset], iterations, seed).equity;
}
