import type { GameState, PlayerAction } from '../engine/game';
import type { BankrollLevel, LiveHand } from '../game/session';
import { HERO_SEAT } from '../game/session';
import { analyzeDecision } from '../strategy/advisor';
import type { Advice, ConceptId, Grade, SpotTag, Verdict } from '../strategy/types';
import { CONCEPTS, type Concept } from './concepts';
import { explanation, situationText, userActionText, verdictText } from './explain';

export interface DecisionReview {
  index: number;
  stateBefore: GameState;
  action: PlayerAction;
  advice: Advice;
  verdict: Verdict;
  situation: string;
  userText: string;
  recommendedText: string;
  /** Altre giocate valide (EV vicino alla migliore). */
  alternativesText: string[];
  explanation: string[];
  verdictText: string;
}

export interface HandReview {
  decisions: DecisionReview[];
  netBB: number;
  totalLossBB: number;
  grades: Record<Grade, number>;
  /** 1-3 concetti principali da ripassare. */
  concepts: Concept[];
  headline: string;
  /** Errori (per statistiche e ripasso). */
  mistakes: { spot: SpotTag; grade: Grade; lossBB: number }[];
}

export function reviewDecision(stateBefore: GameState, action: PlayerAction, bankroll: BankrollLevel, index = 0): DecisionReview {
  const { advice, verdict } = analyzeDecision(stateBefore, action, bankroll);
  const alternatives = advice.acceptable
    .filter((c) => c !== advice.best && c.action !== advice.best.action)
    .map((c) => c.label);
  return {
    index,
    stateBefore,
    action,
    advice,
    verdict,
    situation: situationText(stateBefore, advice),
    userText: userActionText(action, stateBefore),
    recommendedText: advice.best.label,
    alternativesText: [...new Set(alternatives)],
    explanation: explanation(advice),
    verdictText: verdictText(verdict, advice, advice.evMode),
  };
}

/** `opts.netBB`: risultato reale da mostrare (mani importate, dove le carte avversarie non sono tutte note). */
export function reviewHand(hand: LiveHand, bankroll: BankrollLevel, opts: { netBB?: number } = {}): HandReview {
  const decisions = hand.decisions.map((d, i) => reviewDecision(d.stateBefore, d.action, bankroll, i));
  const grades: Record<Grade, number> = { ottima: 0, accettabile: 0, errore: 0, 'errore-grave': 0 };
  let totalLoss = 0;
  const conceptWeight = new Map<ConceptId, number>();
  for (const d of decisions) {
    grades[d.verdict.grade]++;
    totalLoss += d.verdict.evLossBB;
    const w = d.verdict.grade === 'errore-grave' ? 3 : d.verdict.grade === 'errore' ? 2 : d.verdict.grade === 'accettabile' ? 0.6 : 0.2;
    d.advice.concepts.forEach((c, i) => {
      // I primi concetti elencati sono i più pertinenti alla decisione.
      conceptWeight.set(c, (conceptWeight.get(c) ?? 0) + w * (1 - i * 0.12));
    });
  }
  const errors = decisions.filter((d) => d.verdict.grade === 'errore' || d.verdict.grade === 'errore-grave');
  const maxConcepts = errors.length >= 2 ? 3 : errors.length === 1 ? 2 : 1;
  const concepts = [...conceptWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxConcepts)
    .map(([id]) => CONCEPTS[id]);

  let headline: string;
  if (decisions.length === 0) headline = 'Non hai preso decisioni in questa mano.';
  else if (errors.length === 0) headline = grades.accettabile ? 'Buona mano: nessun errore, solo qualche dettaglio migliorabile.' : 'Mano giocata in modo impeccabile!';
  else if (grades['errore-grave'] > 0) headline = `Attenzione: ${grades['errore-grave'] === 1 ? 'un errore grave' : `${grades['errore-grave']} errori gravi`} in questa mano.`;
  else headline = `${errors.length === 1 ? 'Un errore' : `${errors.length} errori`} da rivedere.`;

  return {
    decisions,
    netBB: opts.netBB ?? (hand.state.result?.net[HERO_SEAT] ?? 0) / hand.state.bigBlind,
    totalLossBB: totalLoss,
    grades,
    concepts,
    headline,
    mistakes: decisions
      .filter((d) => d.verdict.grade === 'errore' || d.verdict.grade === 'errore-grave' || d.verdict.grade === 'accettabile')
      .map((d) => ({ spot: d.advice.spot, grade: d.verdict.grade, lossBB: d.verdict.evLossBB })),
  };
}
