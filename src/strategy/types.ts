import type { Card } from '../engine/cards';
import type { Street } from '../engine/game';
import type { Position } from '../engine/positions';
import type { HandInfo } from './handClass';
import type { HandCode } from './handNotation';

export type AdviceAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** Una giocata possibile con il suo valore atteso stimato. */
export interface Candidate {
  action: AdviceAction;
  /** Importo "raise to" in fiches per bet/raise/allin. */
  amount?: number;
  /** Dimensione come frazione del piatto (postflop) o multiplo del BB (preflop). */
  size?: number;
  label: string;
  /** EV stimato in fiches, relativo al fold (fold = 0). */
  ev: number;
  foldEquity?: number;
  equityWhenCalled?: number;
}

/** Tipo di situazione: usato per le statistiche sugli errori e per il ripasso. */
export type SpotTag =
  | 'preflop-open'
  | 'preflop-vs-limp'
  | 'preflop-vs-open'
  | 'bb-defense'
  | 'preflop-vs-3bet'
  | 'preflop-vs-4bet'
  | 'push-fold'
  | 'call-allin'
  | 'postflop-value'
  | 'postflop-bluff'
  | 'postflop-draw'
  | 'postflop-call'
  | 'postflop-medium';

export const SPOT_LABELS_IT: Record<SpotTag, string> = {
  'preflop-open': 'Apertura preflop',
  'preflop-vs-limp': 'Preflop contro limp',
  'preflop-vs-open': 'Risposta a un rilancio preflop',
  'bb-defense': 'Difesa del big blind',
  'preflop-vs-3bet': 'Risposta a un 3-bet',
  'preflop-vs-4bet': 'Risposta a un 4-bet',
  'push-fold': 'Push/fold con stack corto',
  'call-allin': 'Chiamare un all-in',
  'postflop-value': 'Value bet',
  'postflop-bluff': 'Bluff',
  'postflop-draw': 'Giocare un progetto',
  'postflop-call': 'Chiamare una puntata (pot odds)',
  'postflop-medium': 'Mani medie e controllo del piatto',
};

export type ConceptId =
  | 'range-position'
  | 'position'
  | 'pot-odds'
  | 'implied-odds'
  | 'outs'
  | 'sizing'
  | 'spr'
  | 'value-bet'
  | 'bluff'
  | 'semi-bluff'
  | 'fold-equity'
  | 'bankroll'
  | 'table-size'
  | 'push-fold'
  | 'three-bet'
  | 'bb-defense'
  | 'equity';

/** Motivo strutturato: codice + parametri. Il testo italiano viene generato in review/explain.ts. */
export type Reason =
  | { code: 'range'; inRange: boolean; rangeLabel: string; rangeText: string; rangePercent: number; hand: HandCode; handPercentile: number; action: string }
  | { code: 'position'; position: Position; behind: number; numPlayers: number; inPosition?: boolean }
  | { code: 'table-size'; numPlayers: number }
  | { code: 'pot-odds'; toCall: number; pot: number; required: number; equity: number; realization: number }
  | { code: 'implied-odds'; extraNeeded: number; effStack: number; worthIt: boolean }
  | { code: 'outs'; outs: number; flushOuts: number; straightOuts: number; ruleEstimate: number; exact: number; streetsToCome: 1 | 2 }
  | { code: 'spr'; spr: number; strongHand: boolean }
  | { code: 'value'; handDesc: string; equityWhenCalled: number; size: number }
  | { code: 'bluff'; foldEquity: number; breakEven: number; size: number }
  | { code: 'semi-bluff'; foldEquity: number; outs: number }
  | { code: 'pot-control'; handDesc: string }
  | { code: 'give-up'; handDesc: string; foldEquity: number; breakEven: number }
  | { code: 'push-fold'; stackBB: number; inRange: boolean; rangePercent: number }
  | { code: 'bankroll'; level: string; margin: number; evPerRisk: number }
  | { code: 'villain-style'; style: string; name: string }
  | { code: 'multiway'; opponents: number }
  | { code: 'board'; description: string }
  | { code: 'hand'; description: string; bucket: string }
  | { code: 'equity-vs-range'; equity: number; villainLabel: string }
  | { code: 'premium'; hand: HandCode }
  | { code: 'sizing-preflop'; recommendedBB: number; limpers: number }
  | { code: 'three-bet-value'; hand: HandCode; foldEquity: number }
  | { code: 'limp-bad' };

export interface VillainSummary {
  seat: number;
  name: string;
  position: Position;
  style?: string;
  preflopLabel: string;
  preflopPercent: number;
  notes: string[];
}

export interface Advice {
  street: Street;
  spot: SpotTag;
  hole: Card[];
  board: Card[];
  heroCode: HandCode;
  position: Position;
  numPlayers: number;
  handInfo?: HandInfo;
  pot: number;
  toCall: number;
  /** Equity minima richiesta per chiamare (pot odds). */
  potOdds: number;
  spr: number;
  effStackBB: number;
  inPosition: boolean;
  /** Equity dell'eroe contro i range stimati (null se non calcolata). */
  equity: number | null;
  villains: VillainSummary[];
  referenceRange?: { label: string; text: string; percent: number; contains: boolean; codes: HandCode[] };
  candidates: Candidate[];
  best: Candidate;
  /** Giocate con EV vicino alla migliore: anch'esse valide. */
  acceptable: Candidate[];
  multipleLinesValid: boolean;
  reasons: Reason[];
  /** Assunzioni fatte (range stimati, modello semplificato…). */
  assumptions: string[];
  concepts: ConceptId[];
  /** 'absolute': EV calcolati col modello; 'relative': perdite stimate rispetto alla giocata da range (preflop). */
  evMode: 'absolute' | 'relative';
}

export type Grade = 'ottima' | 'accettabile' | 'errore' | 'errore-grave';

export const GRADE_LABELS_IT: Record<Grade, string> = {
  ottima: 'Ottima',
  accettabile: 'Accettabile',
  errore: 'Errore',
  'errore-grave': 'Errore grave',
};

export interface Verdict {
  grade: Grade;
  /** Perdita stimata rispetto alla giocata consigliata, in big blind. */
  evLossBB: number;
  user: Candidate;
  sameAsBest: boolean;
  sizingNote?: string;
  /** La differenza dipende soprattutto dalla stima della fold equity (bluff): giudizio attenuato. */
  uncertain?: boolean;
}

export interface DecisionAnalysis {
  advice: Advice;
  verdict: Verdict;
}
