import type { GameState, PlayerAction } from '../engine/game';
import type { BankrollLevel } from '../game/session';
import { bankrollInfo } from './bankroll';
import { handCode } from './handNotation';
import { postflopAdvice } from './postflopAdvisor';
import { preflopAdvice, type PartialAdvice } from './preflopAdvisor';
import { buildContext } from './situation';
import type { Advice, Candidate, DecisionAnalysis, Grade, Verdict } from './types';

/**
 * Analizza una decisione: produce il consiglio strutturato e il giudizio sulla giocata dell'utente.
 * `stateBefore` è lo stato del gioco nel momento in cui l'utente doveva decidere.
 */
export function analyzeDecision(stateBefore: GameState, action: PlayerAction, bankroll: BankrollLevel): DecisionAnalysis {
  const ctx = buildContext(stateBefore);
  if (!ctx) throw new Error('Nessuna decisione da analizzare');
  const br = bankrollInfo(bankroll);
  const partial: PartialAdvice & { handInfo?: Advice['handInfo'] } =
    ctx.street === 'preflop' ? preflopAdvice(ctx, br) : postflopAdvice(ctx, br);

  const { bb } = ctx;
  const tol = Math.max(0.15 * bb, 0.04 * ctx.pot);
  const acceptable = partial.candidates.filter((c) => c.ev >= partial.best.ev - tol);
  const kinds = new Set(acceptable.map((c) => (c.action === 'allin' ? 'raise' : c.action === 'bet' ? 'raise' : c.action)));

  const advice: Advice = {
    street: ctx.street,
    spot: partial.spot,
    hole: ctx.me.hole,
    board: ctx.board,
    heroCode: handCode(ctx.me.hole[0], ctx.me.hole[1]),
    position: ctx.me.position,
    numPlayers: ctx.numPlayers,
    handInfo: partial.handInfo,
    pot: ctx.pot,
    toCall: ctx.toCall,
    potOdds: ctx.potOdds,
    spr: ctx.spr,
    effStackBB: ctx.effectiveStackBB,
    inPosition: ctx.inPosition,
    equity: partial.equity,
    villains: partial.villains.map((v) => {
      const p = stateBefore.players[v.seat];
      return {
        seat: v.seat, name: p.name, position: p.position, style: p.botStyle,
        preflopLabel: v.preflopLabel, preflopPercent: v.preflopPercent, notes: v.notes,
      };
    }),
    referenceRange: partial.referenceRange,
    candidates: partial.candidates,
    best: partial.best,
    acceptable,
    multipleLinesValid: kinds.size > 1,
    reasons: partial.reasons,
    assumptions: partial.assumptions,
    concepts: [...new Set(partial.concepts)],
    evMode: partial.evMode,
  };

  const user = partial.evaluate(action);
  const verdict = grade(advice, user, ctx.pot, bb, partial.evMode);
  return { advice, verdict };
}

function sameKind(a: Candidate, b: Candidate): boolean {
  const norm = (c: Candidate) => (c.action === 'bet' || c.action === 'raise' || c.action === 'allin' ? 'aggr' : c.action);
  return norm(a) === norm(b);
}

function grade(advice: Advice, user: Candidate, pot: number, bb: number, mode: 'absolute' | 'relative'): Verdict {
  const best = advice.best;
  const lossChips = Math.max(0, best.ev - user.ev);
  let lossBB = lossChips / bb;
  let sameAsBest = sameKind(user, best);
  let sizingNote: string | undefined;
  if (sameAsBest && user.amount !== undefined && best.amount !== undefined && best.amount > 0) {
    const ratio = user.amount / best.amount;
    const bothAllIn = user.action === 'allin' && best.action === 'allin';
    if (!bothAllIn && (ratio < 0.7 || ratio > 1.4)) {
      sizingNote = ratio < 1
        ? 'La direzione è giusta ma la puntata è piccola rispetto a quella consigliata.'
        : 'La direzione è giusta ma la puntata è grande rispetto a quella consigliata.';
      if (lossBB > 0.1) sameAsBest = false;
    }
  }
  // Bluff e semi-bluff dipendono dalla stima della fold equity: l'errore viene pesato la metà e mai "grave".
  const isBluffLine = (c: Candidate) =>
    (c.action === 'bet' || c.action === 'raise' || c.action === 'allin') && (c.equityWhenCalled ?? 1) < 0.45;
  const weakHand = advice.handInfo ? ['air', 'weak', 'draw', 'strongDraw', 'medium'].includes(advice.handInfo.bucket) : false;
  const uncertain = mode === 'absolute' && advice.street !== 'preflop' && weakHand && (isBluffLine(best) || isBluffLine(user));
  if (uncertain) lossBB *= 0.5;
  const potBB = pot / bb;
  let g: Grade;
  const sizingOnly = !sameAsBest && sizingNote !== undefined;
  if (sameAsBest && lossBB <= 0.1) g = 'ottima';
  else if (sizingOnly && lossBB <= Math.max(1.5, 0.12 * potBB)) g = 'accettabile';
  else if (lossBB <= Math.max(0.25, (mode === 'absolute' ? 0.05 : 0.04) * potBB) || advice.acceptable.some((c) => c === user)) g = 'accettabile';
  else if (lossBB <= Math.max(1.5, 0.25 * potBB)) g = 'errore';
  else g = uncertain ? 'errore' : 'errore-grave';
  return { grade: g, evLossBB: lossBB, user, sameAsBest: g === 'ottima', sizingNote, uncertain };
}
