import type { Card } from '../engine/cards';
import { isForcedPost, type GameState } from '../engine/game';
import { anyTwo, weightedFromCodes, type WeightedRange } from './equity';
import { classifyHand, type Bucket } from './handClass';
import { ALL_HAND_CODES, type HandCode } from './handNotation';
import {
  ALLIN_RANKING,
  HAND_RANKING,
  pushRange,
  rfiRange,
  topPercent,
  vsFourBetRanges,
  vsOpenRanges,
  vsThreeBetRanges,
  openerClass,
} from './ranges';

/** Range stimato di un avversario, con la spiegazione delle assunzioni fatte. */
export interface VillainRange {
  seat: number;
  range: WeightedRange;
  /** Descrizione italiana del range preflop assunto. */
  preflopLabel: string;
  /** Percentuale approssimativa di mani preflop. */
  preflopPercent: number;
  /** Note sul restringimento postflop (es. "ha puntato al flop: range più forte"). */
  notes: string[];
}

function codesPercent(codes: Set<HandCode>): number {
  let n = 0;
  for (const h of codes) n += h[0] === h[1] ? 6 : h[2] === 's' ? 4 : 12;
  return (n / 1326) * 100;
}

/** Range preflop di un giocatore, dedotto dalle sue azioni preflop (fino a `upTo` nel log). */
export function preflopRangeOf(
  state: GameState,
  seat: number,
  dead: readonly Card[],
  upTo = state.log.length,
): { range: WeightedRange; label: string; percent: number } {
  const log = state.log.slice(0, upTo).filter((a) => a.street === 'preflop');
  const p = state.players[seat];
  const n = state.numPlayers;
  let raises = 0;
  let openerPos = p.position;
  let lastKind: string = 'none';
  let lastRaiseLevel = 0;
  let wasAllIn = false;
  for (const a of log) {
    if (a.type === 'raise') {
      raises++;
      if (raises === 1) openerPos = state.players[a.seat].position;
    }
    if (a.seat !== seat) continue;
    if (a.type === 'raise') { lastKind = 'raise'; lastRaiseLevel = raises; }
    else if (a.type === 'call') { lastKind = raises === 0 ? 'limp' : 'call'; lastRaiseLevel = raises; }
    else if (a.type === 'check') { lastKind = 'check'; }
    wasAllIn = a.allIn;
  }

  const stackBB = (p.stackStart) / state.bigBlind;
  let codes: Set<HandCode>;
  let label: string;
  let weightTail: { codes: Set<HandCode>; weight: number } | null = null;

  if (lastKind === 'raise' && wasAllIn && stackBB <= 20 && lastRaiseLevel === 1) {
    const r = pushRange(p.position, n, stackBB);
    codes = r.codes;
    label = `all-in da ${p.position} con ${Math.round(stackBB)}bb (range push/fold)`;
  } else if (lastKind === 'raise') {
    const raiseBB = (log.filter((a) => a.seat === seat && a.type === 'raise').pop()?.amount ?? 0) / state.bigBlind;
    if (lastRaiseLevel === 1 && (wasAllIn || raiseBB > 8)) {
      // Apertura enorme o all-in con stack profondi: range stretto e polarizzato.
      codes = topPercent(8, ALLIN_RANKING);
      label = `apertura ${wasAllIn ? 'all-in' : `a ${Math.round(raiseBB)}bb`} da ${p.position} (range stretto, ~8%)`;
    } else if (lastRaiseLevel === 1) {
      const r = rfiRange(p.position, n);
      codes = r.codes;
      label = `apertura standard da ${p.position}`;
    } else if (lastRaiseLevel === 2) {
      const r = vsOpenRanges(p.position, openerPos, n).threeBet;
      codes = r.codes;
      label = `3-bet da ${p.position} contro apertura da ${openerPos}`;
      if (wasAllIn) codes = new Set([...codes, ...topPercent(8, ALLIN_RANKING)]);
    } else if (lastRaiseLevel === 3) {
      codes = vsThreeBetRanges(openerClass(openerPos, n) === 'late').fourBet.codes;
      label = '4-bet';
    } else {
      codes = vsFourBetRanges().jam.codes;
      label = '5-bet / all-in';
    }
  } else if (lastKind === 'call') {
    if (lastRaiseLevel === 1) {
      const vr = vsOpenRanges(p.position, openerPos, n);
      codes = vr.call.codes.size ? vr.call.codes : topPercent(10);
      label = p.position === 'BB' ? `difesa del BB contro ${openerPos}` : `call di un'apertura da ${openerPos}`;
      // Qualche mano forte giocata in slowplay.
      weightTail = { codes: vr.threeBet.codes, weight: 0.25 };
    } else if (lastRaiseLevel === 2) {
      codes = vsThreeBetRanges(true).call.codes;
      label = 'call di un 3-bet';
      weightTail = { codes: vsThreeBetRanges(true).fourBet.codes, weight: 0.3 };
    } else {
      codes = vsFourBetRanges().call.codes;
      label = 'call di un 4-bet';
      weightTail = { codes: vsFourBetRanges().jam.codes, weight: 0.5 };
    }
    if (wasAllIn) {
      codes = new Set([...codes, ...topPercent(12, ALLIN_RANKING)]);
      label += ' (all-in)';
    }
  } else if (lastKind === 'limp') {
    const top = topPercent(6);
    codes = new Set([...topPercent(45)].filter((h) => !top.has(h)));
    label = `limp da ${p.position}`;
    weightTail = { codes: top, weight: 0.2 };
  } else if (lastKind === 'check' && p.position === 'BB') {
    const top = topPercent(8);
    codes = new Set(ALL_HAND_CODES.filter((h) => !top.has(h)));
    label = 'BB che non ha rilanciato (qualsiasi mano tranne le più forti)';
    weightTail = { codes: top, weight: 0.2 };
  } else {
    codes = topPercent(30);
    label = 'range generico (30% delle mani)';
  }

  const range = weightedFromCodes(codes, dead, 1);
  if (weightTail) {
    const extra = [...weightTail.codes].filter((h) => !codes.has(h));
    range.push(...weightedFromCodes(extra, dead, weightTail.weight));
  }
  return { range, label, percent: codesPercent(codes) };
}

/** Peso relativo con cui una mano di una certa fascia compie un'azione postflop. */
const ACTION_WEIGHTS: Record<'bet' | 'raise' | 'call' | 'check', Record<Bucket, number>> = {
  bet: { monster: 1, strong: 1, medium: 0.7, strongDraw: 0.9, draw: 0.7, weak: 0.3, air: 0.35 },
  raise: { monster: 1, strong: 0.7, medium: 0.15, strongDraw: 0.6, draw: 0.3, weak: 0.08, air: 0.12 },
  call: { monster: 0.5, strong: 1, medium: 1, strongDraw: 1, draw: 0.95, weak: 0.5, air: 0.12 },
  check: { monster: 0.45, strong: 0.7, medium: 1, strongDraw: 0.8, draw: 0.9, weak: 1, air: 1 },
};

const ACTION_NOTES: Record<'bet' | 'raise' | 'call' | 'check', string> = {
  bet: 'ha puntato: range spostato verso mani fatte e progetti, con alcuni bluff',
  raise: 'ha rilanciato: range molto forte (mani forti e progetti, pochi bluff)',
  call: 'ha chiamato: range di mani medie, progetti e qualche mano forte',
  check: 'ha fatto check: poche mani molto forti (alcune in slowplay)',
};

/**
 * Range attuale di un avversario: range preflop ristretto in base alle azioni postflop
 * (fino all'indice `upTo` del log, escluso).
 */
export function estimateVillainRange(
  state: GameState,
  seat: number,
  heroCards: readonly Card[],
  upTo = state.log.length,
): VillainRange {
  const dead = [...heroCards, ...state.board];
  const pre = preflopRangeOf(state, seat, dead, upTo);
  let range = pre.range;
  const notes: string[] = [];
  const actions = state.log.slice(0, upTo).filter((a) => a.seat === seat && a.street !== 'preflop');
  for (const a of actions) {
    if (a.type === 'fold' || isForcedPost(a)) continue;
    const kind = a.type === 'call' && a.toCallBefore === 0 ? 'check' : (a.type as 'bet' | 'raise' | 'call' | 'check');
    const weights = ACTION_WEIGHTS[kind];
    range = range
      .map((w) => ({ cards: w.cards, weight: w.weight * weights[classifyHand(w.cards, a.board).bucket] }))
      .filter((w) => w.weight > 0.001);
    const streetName = a.street === 'flop' ? 'al flop' : a.street === 'turn' ? 'al turn' : 'al river';
    notes.push(`${streetName} ${ACTION_NOTES[kind]}`);
  }
  if (range.length === 0) range = anyTwo(dead);
  return { seat, range, preflopLabel: pre.label, preflopPercent: pre.percent, notes };
}

/** Probabilità che una mano di una certa fascia continui (call o raise) contro una puntata di `f` volte il piatto. */
export function continueProbability(bucket: Bucket, f: number, river: boolean, vsRaise: boolean): number {
  // Puntate molto grandi rispetto al piatto (overbet, all-in) vengono pagate meno spesso, tranne dai mostri.
  const over = f <= 1.2 ? 1 : f <= 2 ? 0.75 : f <= 4 ? 0.5 : 0.3;
  if (bucket !== 'monster' && over < 1) {
    // Le mani forti e i progetti forti pagano comunque spesso: lo sconto vale soprattutto per le mani marginali.
    const floor: Partial<Record<Bucket, number>> = { strong: 0.7, strongDraw: 0.6, draw: 0.45 };
    return baseContinue(bucket, Math.min(f, 1.2), river, vsRaise) * Math.max(over, floor[bucket] ?? 0);
  }
  return baseContinue(bucket, f, river, vsRaise);
}

function baseContinue(bucket: Bucket, f: number, river: boolean, vsRaise: boolean): number {
  if (vsRaise) {
    const t: Record<Bucket, number> = { monster: 1, strong: 0.9, medium: 0.55, strongDraw: 0.85, draw: 0.6, weak: 0.25, air: 0.08 };
    let p = t[bucket];
    if (river && (bucket === 'draw' || bucket === 'strongDraw')) p = 0.05;
    return p;
  }
  switch (bucket) {
    case 'monster': return 1;
    case 'strong': return f <= 1 ? 1 : 0.9;
    case 'medium': return f <= 0.4 ? 0.95 : f <= 0.8 ? 0.8 : f <= 1.1 ? 0.6 : 0.4;
    case 'strongDraw': return river ? 0.05 : f <= 1.2 ? 1 : 0.8;
    case 'draw': return river ? 0.04 : f <= 0.8 ? 0.9 : 0.6;
    case 'weak': return f <= 0.4 ? 0.6 : f <= 0.8 ? 0.4 : 0.2;
    case 'air': return river ? 0.04 : f <= 0.4 ? 0.3 : f <= 0.8 ? 0.18 : 0.1;
  }
}

/** Divide un range in "chi continua" e calcola la fold equity contro una puntata. */
export function splitByContinuation(
  range: WeightedRange,
  board: readonly Card[],
  f: number,
  vsRaise: boolean,
): { foldEquity: number; continuing: WeightedRange } {
  const river = board.length === 5;
  let total = 0;
  let folded = 0;
  const continuing: WeightedRange = [];
  for (const w of range) {
    const p = continueProbability(classifyHand(w.cards, board).bucket, f, river, vsRaise);
    total += w.weight;
    folded += w.weight * (1 - p);
    if (p > 0) continuing.push({ cards: w.cards, weight: w.weight * p });
  }
  return { foldEquity: total > 0 ? folded / total : 0, continuing };
}

/** Preflop: chi continua contro un rilancio è la parte alta del range (per classifica). */
export function preflopContinuing(range: WeightedRange, keepFraction: number): { foldEquity: number; continuing: WeightedRange } {
  // Ordina le combinazioni per forza preflop e tiene la frazione migliore (pesata).
  const rankIdx = new Map(HAND_RANKING.map((h, i) => [h, i]));
  const codeOf = (c: [number, number]) => {
    const r1 = (c[0] >> 2) + 2;
    const r2 = (c[1] >> 2) + 2;
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    const ch = '23456789TJQKA';
    if (hi === lo) return ch[hi - 2] + ch[lo - 2];
    return ch[hi - 2] + ch[lo - 2] + ((c[0] & 3) === (c[1] & 3) ? 's' : 'o');
  };
  const sorted = [...range].sort((a, b) => (rankIdx.get(codeOf(a.cards)) ?? 999) - (rankIdx.get(codeOf(b.cards)) ?? 999));
  const total = sorted.reduce((s, w) => s + w.weight, 0);
  const target = total * keepFraction;
  let acc = 0;
  const continuing: WeightedRange = [];
  for (const w of sorted) {
    if (acc >= target) break;
    continuing.push(w);
    acc += w.weight;
  }
  return { foldEquity: total > 0 ? 1 - acc / total : 0, continuing };
}
