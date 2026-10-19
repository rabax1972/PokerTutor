import type { Street } from '../engine/game';
import type { Position } from '../engine/positions';
import type { GameMode } from '../game/session';
import type { ConceptId, Grade, SpotTag } from '../strategy/types';

export interface StoredDecision {
  street: Street;
  spot: SpotTag;
  grade: Grade;
  lossBB: number;
}

export interface StoredHand {
  id: string;
  ts: number;
  mode: GameMode | 'import';
  lessonId?: string;
  /** Portale di provenienza (mani importate). */
  site?: string;
  numPlayers: number;
  position: Position;
  heroCode: string;
  netBB: number;
  decisions: StoredDecision[];
  concepts: ConceptId[];
}

const KEY = 'pokerTutor.v1.hands';
const MAX_HANDS = 1000;

/** Accesso a localStorage protetto: in navigazione privata o con storage bloccato non deve rompere l'app. */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadHands(): StoredHand[] {
  try {
    const raw = safeStorage()?.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as StoredHand[]) : [];
  } catch {
    return [];
  }
}

export function saveHand(hand: StoredHand): StoredHand[] {
  const hands = loadHands();
  if (hands.some((h) => h.id === hand.id)) return hands;
  hands.push(hand);
  const trimmed = hands.slice(-MAX_HANDS);
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Storage pieno o non disponibile: le statistiche restano solo per questa sessione.
  }
  return trimmed;
}

export function clearHands(): void {
  try {
    safeStorage()?.removeItem(KEY);
  } catch {
    /* ignora */
  }
}

// --- statistiche ---------------------------------------------------------------

export interface SpotStats {
  spot: SpotTag;
  total: number;
  errors: number;
  lossBB: number;
}

export interface TrendPoint {
  hand: number;
  /** % di decisioni corrette (ottima + accettabile) sulle ultime N mani. */
  correctPct: number | null;
  cumNetBB: number;
}

export interface Stats {
  hands: number;
  decisions: number;
  correctPct: number;
  netBB: number;
  byGrade: Record<Grade, number>;
  bySpot: SpotStats[];
  trend: TrendPoint[];
  totalLossBB: number;
}

const isCorrect = (g: Grade) => g === 'ottima' || g === 'accettabile';
const isError = (g: Grade) => g === 'errore' || g === 'errore-grave';

export function computeStats(hands: StoredHand[], window = 20): Stats {
  const byGrade: Record<Grade, number> = { ottima: 0, accettabile: 0, errore: 0, 'errore-grave': 0 };
  const spots = new Map<SpotTag, SpotStats>();
  let decisions = 0;
  let correct = 0;
  let net = 0;
  let loss = 0;
  const trend: TrendPoint[] = [];
  hands.forEach((h, i) => {
    net += h.netBB;
    for (const d of h.decisions) {
      decisions++;
      byGrade[d.grade]++;
      if (isCorrect(d.grade)) correct++;
      loss += d.lossBB;
      const s = spots.get(d.spot) ?? { spot: d.spot, total: 0, errors: 0, lossBB: 0 };
      s.total++;
      if (isError(d.grade)) { s.errors++; s.lossBB += d.lossBB; }
      spots.set(d.spot, s);
    }
    const recent = hands.slice(Math.max(0, i - window + 1), i + 1).flatMap((x) => x.decisions);
    trend.push({
      hand: i + 1,
      correctPct: recent.length ? (recent.filter((d) => isCorrect(d.grade)).length / recent.length) * 100 : null,
      cumNetBB: net,
    });
  });
  return {
    hands: hands.length,
    decisions,
    correctPct: decisions ? (correct / decisions) * 100 : 0,
    netBB: net,
    byGrade,
    bySpot: [...spots.values()].sort((a, b) => b.errors - a.errors || b.lossBB - a.lossBB),
    trend,
    totalLossBB: loss,
  };
}

/**
 * Peso di ciascun tipo di situazione per il ripasso: errori recenti contano di più,
 * gli errori gravi il doppio.
 */
export function reviewWeights(hands: StoredHand[]): Partial<Record<SpotTag, number>> {
  const out: Partial<Record<SpotTag, number>> = {};
  const recent = hands.slice(-150);
  recent.forEach((h, i) => {
    const recency = 0.4 + (0.6 * (i + 1)) / recent.length;
    for (const d of h.decisions) {
      if (!isError(d.grade)) continue;
      out[d.spot] = (out[d.spot] ?? 0) + recency * (d.grade === 'errore-grave' ? 2 : 1);
    }
  });
  return out;
}

export function hasMistakes(hands: StoredHand[]): boolean {
  return Object.keys(reviewWeights(hands)).length > 0;
}
