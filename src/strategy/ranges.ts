import type { Position } from '../engine/positions';
import { positionNames } from '../engine/positions';
import { ALL_HAND_CODES, parseRange, rangePercent, type HandCode } from './handNotation';
import { PREFLOP_EQUITY_VS_RANDOM } from './data/preflopEquity';

/**
 * Range preflop di riferimento. Sono semplificazioni didattiche di range standard
 * (cash game, stack ~100bb, rilancio a 2.5bb), NON soluzioni GTO.
 */
export interface NamedRange {
  codes: Set<HandCode>;
  /** Testo in notazione classica, mostrato all'utente. */
  text: string;
  /** Etichetta italiana, es. "Apertura dal CO (6 giocatori)". */
  label: string;
  percent: number;
}

function named(text: string, label: string): NamedRange {
  const codes = parseRange(text);
  return { codes, text, label, percent: rangePercent(codes) };
}

function minus(a: NamedRange, b: NamedRange): NamedRange {
  const codes = new Set([...a.codes].filter((h) => !b.codes.has(h)));
  return { ...a, codes, percent: rangePercent(codes) };
}

// --- Apertura (RFI: raise first in) per numero di giocatori ancora da parlare dopo di noi ---

const RFI_TEXT: Record<number, string> = {
  7: '66+, A9s+, A5s, KTs+, QTs+, JTs, T9s, AJo+, KQo',
  6: '55+, A8s+, A5s-A4s, KTs+, QTs+, JTs, T9s, 98s, ATo+, KQo',
  5: '44+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+',
  4: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, ATo+, KTo+, QJo',
  3: '22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo',
  2: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
  1: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K7o+, Q9o+, J9o+, T9o',
};
const RFI_HEADS_UP =
  '22+, A2s+, K2s+, Q2s+, J2s+, T3s+, 95s+, 84s+, 73s+, 63s+, 52s+, 42s+, 32s, A2o+, K2o+, Q4o+, J6o+, T6o+, 96o+, 86o+, 75o+, 65o';

/** Quanti giocatori parlano dopo `pos` preflop, in un pot non ancora aperto. */
export function playersBehind(pos: Position, numPlayers: number): number {
  const names = positionNames(numPlayers);
  const offset = names.indexOf(pos);
  if (numPlayers === 2) return pos === 'BTN' ? 1 : 0;
  if (offset === 0) return 2; // BTN: dietro ci sono SB e BB
  if (offset === 1) return 1; // SB: dietro c'è il BB
  if (offset === 2) return 0; // BB
  return numPlayers - offset + 2;
}

export function rfiRange(pos: Position, numPlayers: number): NamedRange {
  if (numPlayers === 2 && pos === 'BTN') {
    return named(RFI_HEADS_UP, 'Apertura dal bottone in heads-up');
  }
  const behind = Math.min(7, Math.max(1, playersBehind(pos, numPlayers)));
  return named(RFI_TEXT[behind], `Apertura da ${pos} (${numPlayers} giocatori)`);
}

// --- Risposta a un'apertura ---

/** Classe dell'apritore: più giocatori aveva dietro, più il suo range è stretto. */
export type OpenerClass = 'early' | 'middle' | 'late' | 'headsup';

export function openerClass(openerPos: Position, numPlayers: number): OpenerClass {
  if (numPlayers === 2) return 'headsup';
  const behind = playersBehind(openerPos, numPlayers);
  if (behind >= 5) return 'early';
  if (behind >= 3) return 'middle';
  return 'late';
}

const THREEBET_TEXT: Record<OpenerClass, string> = {
  early: 'QQ+, AKs, AKo, A5s',
  middle: 'JJ+, AQs+, AKo, KQs, A5s-A4s',
  late: '99+, ATs+, KJs+, QJs, AJo+, KQo, A5s-A2s',
  headsup: '88+, A8s+, KTs+, QJs, ATo+, KJo+, A5s-A2s, 76s, 65s',
};
/** Nello small blind contro aperture tardive si gioca quasi solo 3-bet o fold. */
const SB_THREEBET_LATE = '88+, A9s+, KTs+, QJs, JTs, ATo+, KJo+, A5s-A2s';

const CALL_IP_TEXT: Record<OpenerClass, string> = {
  early: 'JJ-66, AQs-AJs, KQs, QJs, JTs, AQo',
  middle: 'TT-22, AJs-ATs, KJs+, QJs, JTs, T9s, 98s, AQo-AJo, KQo',
  late: '88-22, A9s-A6s, K9s+, QTs+, JTs, T9s, 98s, 87s, 76s, ATo, KJo, QJo',
  headsup: '',
};

const BB_CALL_TEXT: Record<OpenerClass, string> = {
  early: 'TT-22, AQs-A2s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo-ATo, KQo',
  middle: 'TT-22, AJs-A2s, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AQo-A9o, KTo+, QTo+, JTo',
  late: '88-22, A9s-A2s, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 54s, ATo-A2o, K9o+, Q9o+, J9o+, T9o, 98o',
  headsup:
    '77-22, A7s-A2s, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A9o-A2o, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
};

export interface VsOpenRanges {
  threeBet: NamedRange;
  call: NamedRange;
}

export function vsOpenRanges(heroPos: Position, openerPos: Position, numPlayers: number): VsOpenRanges {
  const oc = openerClass(openerPos, numPlayers);
  const ctx = `contro apertura da ${openerPos}`;
  let threeBet = named(THREEBET_TEXT[oc], `3-bet ${ctx}`);
  let callText: string;
  if (heroPos === 'BB') callText = BB_CALL_TEXT[oc];
  else if (heroPos === 'SB') {
    if (oc === 'late') threeBet = named(SB_THREEBET_LATE, `3-bet dallo SB ${ctx}`);
    callText = oc === 'late' ? '' : 'TT-77, AQs-AJs, KQs';
  } else callText = CALL_IP_TEXT[oc];
  const call = minus(
    named(callText || 'AA', heroPos === 'BB' ? `Difesa del BB ${ctx}` : `Call ${ctx}`),
    threeBet,
  );
  if (!callText) call.codes.clear();
  call.percent = rangePercent(call.codes);
  return { threeBet, call };
}

// --- Risposta a un 3-bet e a un 4-bet ---

export function vsThreeBetRanges(threeBettorLate: boolean): { fourBet: NamedRange; call: NamedRange } {
  const fourBet = named(threeBettorLate ? 'QQ+, AKs, AKo, A5s' : 'KK+, AKs, A5s', '4-bet contro 3-bet');
  const call = minus(
    named(
      threeBettorLate
        ? 'JJ-77, AQs-ATs, KJs+, QJs, JTs, T9s, AQo, KQo'
        : 'QQ-88, AQs-AJs, KQs, QJs, JTs, AKo',
      'Call contro 3-bet',
    ),
    fourBet,
  );
  return { fourBet, call };
}

export function vsFourBetRanges(): { jam: NamedRange; call: NamedRange } {
  return {
    jam: named('QQ+, AKs, AKo', 'All-in contro 4-bet'),
    call: named('JJ, AQs', 'Call contro 4-bet (stack profondi)'),
  };
}

/** Rilancio di isolamento contro uno o più limper: un po' più stretto dell'apertura. */
export function isoRaiseRange(pos: Position, numPlayers: number): NamedRange {
  if (pos === 'BB') return named('99+, AJs+, KQs, AQo+', 'Rilancio dal BB contro limp');
  const behind = Math.min(7, playersBehind(pos, numPlayers) + 1);
  const base = numPlayers === 2 ? RFI_TEXT[2] : RFI_TEXT[Math.max(1, behind)];
  return named(base, `Rilancio di isolamento da ${pos}`);
}

// --- Ordinamento delle 169 mani ---

/**
 * Classifica preflop: prima le mani presenti nei range di apertura più stretti, poi via via
 * quelle dei range più larghi; a parità, conta l'equity contro una mano casuale.
 * Usata dai bot (range "top X%") e per stimare quali mani continuano contro un rilancio.
 */
export const HAND_RANKING: HandCode[] = (() => {
  const tiers = [7, 6, 5, 4, 3, 2, 1].map((b) => parseRange(RFI_TEXT[b]));
  tiers.push(parseRange(RFI_HEADS_UP));
  const tierOf = (h: HandCode) => {
    const t = tiers.findIndex((s) => s.has(h));
    return t < 0 ? tiers.length : t;
  };
  return [...ALL_HAND_CODES].sort(
    (a, b) => tierOf(a) - tierOf(b) || PREFLOP_EQUITY_VS_RANDOM[b] - PREFLOP_EQUITY_VS_RANDOM[a],
  );
})();

/** Ordinamento puro per equity contro mano casuale: adatto alle decisioni all-in (push/fold). */
export const ALLIN_RANKING: HandCode[] = [...ALL_HAND_CODES].sort(
  (a, b) => PREFLOP_EQUITY_VS_RANDOM[b] - PREFLOP_EQUITY_VS_RANDOM[a],
);

/** Le migliori mani fino a coprire `percent`% delle 1326 combinazioni. */
export function topPercent(percent: number, ranking: HandCode[] = HAND_RANKING): Set<HandCode> {
  const target = (Math.max(0, Math.min(100, percent)) / 100) * 1326;
  const out = new Set<HandCode>();
  let n = 0;
  for (const h of ranking) {
    if (n >= target) break;
    out.add(h);
    n += h[0] === h[1] ? 6 : h[2] === 's' ? 4 : 12;
  }
  return out;
}

/** Percentile della mano nella classifica (0 = migliore, 100 = peggiore), pesato per combinazioni. */
export function handPercentile(code: HandCode, ranking: HandCode[] = HAND_RANKING): number {
  let n = 0;
  for (const h of ranking) {
    if (h === code) return (n / 1326) * 100;
    n += h[0] === h[1] ? 6 : h[2] === 's' ? 4 : 12;
  }
  return 100;
}

// --- Push/fold con stack corti ---

const PUSH_BASE_10BB: Record<number, number> = { 0: 0, 1: 55, 2: 40, 3: 28, 4: 22, 5: 18, 6: 15, 7: 13 };

/** Percentuale di mani con cui andare all-in per primi, con `stackBB` big blind effettivi. */
export function pushPercent(pos: Position, numPlayers: number, stackBB: number): number {
  const base = numPlayers === 2 ? 62 : PUSH_BASE_10BB[Math.min(7, playersBehind(pos, numPlayers))];
  const pct = base * Math.pow(10 / Math.max(1, stackBB), 0.6);
  return Math.max(4, Math.min(100, pct));
}

export function pushRange(pos: Position, numPlayers: number, stackBB: number): NamedRange {
  const pct = pushPercent(pos, numPlayers, stackBB);
  const codes = topPercent(pct, ALLIN_RANKING);
  return {
    codes,
    text: compactRangeText(codes),
    label: `All-in da ${pos} con ${Math.round(stackBB)}bb`,
    percent: rangePercent(codes),
  };
}

/** Testo compatto (lista di mani) per un range generato. */
export function compactRangeText(codes: Set<HandCode>): string {
  const pairs = ALL_HAND_CODES.filter((h) => h[0] === h[1] && codes.has(h));
  const others = ALL_HAND_CODES.filter((h) => h[0] !== h[1] && codes.has(h));
  const list = [...pairs, ...others];
  if (list.length > 40) return `${list.slice(0, 40).join(', ')}, … (${list.length} mani)`;
  return list.join(', ');
}
